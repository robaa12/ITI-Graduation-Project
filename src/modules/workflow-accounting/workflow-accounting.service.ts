import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  WorkflowAccountingStatus,
  WorkflowExecution,
  WorkflowRunStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { MastraClient } from '../mastra/mastra.client';
import { MastraWorkflowId } from '../mastra/mastra.types';
import {
  WORKFLOW_ACCOUNTING_QUEUE,
  WorkflowAccountingJob,
} from './workflow-accounting.queue';

@Injectable()
export class WorkflowAccountingService {
  private readonly logger = new Logger(WorkflowAccountingService.name);
  private readonly presentationRetryAt = new Map<string, number>();

  private static readonly PRESENTATION_RETRY_COOLDOWN_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastra: MastraClient,
    @InjectQueue(WORKFLOW_ACCOUNTING_QUEUE)
    private readonly queue: Queue<WorkflowAccountingJob>,
  ) {}

  async markRunning(mastraRunId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { mastraRunId },
      select: { startedAt: true },
    });
    if (!execution) return;
    await this.prisma.workflowExecution.updateMany({
      where: { mastraRunId },
      data: {
        status: WorkflowRunStatus.RUNNING,
        ...(execution.startedAt ? {} : { startedAt: new Date() }),
      },
    });
  }

  async markTerminal(
    mastraRunId: string,
    status: WorkflowRunStatus,
  ): Promise<void> {
    await this.prisma.workflowExecution.updateMany({
      where: { mastraRunId },
      data: {
        status,
        ...(status === WorkflowRunStatus.READY ||
        status === WorkflowRunStatus.FAILED
          ? { finishedAt: new Date() }
          : {}),
      },
    });
  }

  async collectOrSchedule(mastraRunId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution
      .findUnique({
        where: { mastraRunId },
        select: { id: true },
      })
      .catch((error) => {
        this.logger.error(
          `Could not load workflow accounting for ${mastraRunId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      });
    if (!execution) return;

    try {
      const status = await this.collect(execution.id);
      if (status !== WorkflowAccountingStatus.PENDING) return;
    } catch (error) {
      this.logger.warn(
        `Workflow usage for ${mastraRunId} was not immediately available: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.queue.add(
        'reconcile',
        { executionId: execution.id },
        {
          jobId: `workflow-accounting-${execution.id}-${randomUUID()}`,
          // Observability is exported asynchronously and may also be briefly
          // unavailable while Mastra restarts. Keep trying for five minutes
          // instead of permanently giving up after the former ~30s window.
          attempts: 20,
          backoff: { type: 'fixed', delay: 15_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      this.logger.error(
        `Could not queue workflow accounting for ${mastraRunId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.markUnavailable(execution.id).catch(() => undefined);
    }
  }

  async collect(executionId: string): Promise<WorkflowAccountingStatus> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) return WorkflowAccountingStatus.UNAVAILABLE;

    const usage = await this.mastra.getWorkflowUsage(
      execution.workflowId as MastraWorkflowId,
      execution.mastraRunId,
      execution.createdAt,
    );
    if (usage.status === 'pending') return WorkflowAccountingStatus.PENDING;

    const ready = usage.status === 'ready' && usage.costUnit === 'USD';
    const accountingStatus = ready
      ? WorkflowAccountingStatus.READY
      : WorkflowAccountingStatus.UNPRICED;
    await this.prisma.workflowExecution.updateMany({
      where: { id: executionId },
      data: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCost:
          ready && usage.estimatedCost != null
            ? new Prisma.Decimal(String(usage.estimatedCost))
            : null,
        costUnit: ready ? usage.costUnit : null,
        accountingStatus,
        modelBreakdown: usage.models,
        usageCollectedAt: new Date(),
      },
    });
    return accountingStatus;
  }

  /**
   * Reconcile stale accounting before it is presented to the browser.
   *
   * A terminal workflow result is durable, but Mastra's observability exporter
   * is eventually consistent. A short exporter outage used to leave the row
   * permanently UNAVAILABLE even when the metrics appeared moments later. This
   * bounded, throttled read-repair makes old and new results self-healing.
   */
  async reconcileForPresentation(
    executions: WorkflowExecution[],
  ): Promise<WorkflowExecution[]> {
    const now = Date.now();
    const retryable = executions.filter((execution) => {
      const accountingIsStale =
        execution.accountingStatus === WorkflowAccountingStatus.PENDING ||
        execution.accountingStatus === WorkflowAccountingStatus.UNAVAILABLE;
      const workflowIsSettled =
        execution.status !== WorkflowRunStatus.PENDING &&
        execution.status !== WorkflowRunStatus.RUNNING;
      const retryAt = this.presentationRetryAt.get(execution.id) ?? 0;
      return (
        accountingIsStale &&
        workflowIsSettled &&
        execution.totalTokens === 0 &&
        now >= retryAt
      );
    });

    if (retryable.length === 0) return executions;

    await Promise.all(
      retryable.map(async (execution) => {
        this.presentationRetryAt.set(
          execution.id,
          now + WorkflowAccountingService.PRESENTATION_RETRY_COOLDOWN_MS,
        );
        try {
          const status = await this.collect(execution.id);
          if (status !== WorkflowAccountingStatus.PENDING) {
            this.presentationRetryAt.delete(execution.id);
          }
        } catch (error) {
          this.logger.warn(
            `Could not refresh workflow usage for ${execution.mastraRunId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    return this.prisma.workflowExecution.findMany({
      where: { id: { in: executions.map((execution) => execution.id) } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markUnavailable(executionId: string): Promise<void> {
    await this.prisma.workflowExecution.updateMany({
      where: {
        id: executionId,
        accountingStatus: WorkflowAccountingStatus.PENDING,
      },
      data: { accountingStatus: WorkflowAccountingStatus.UNAVAILABLE },
    });
  }
}
