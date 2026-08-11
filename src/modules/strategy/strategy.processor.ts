import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  KnowledgeSourceStatus,
  Prisma,
  WorkflowRunStatus,
} from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { MastraClient } from '../mastra/mastra.client';
import { MASTRA_WORKFLOWS } from '../mastra/mastra.types';
import { toErrorMessage, toWorkflowRunStatus } from '../mastra/run-status';
import { WorkflowAccountingService } from '../workflow-accounting/workflow-accounting.service';
import { STRATEGY_QUEUE, StrategyJob } from './strategy.queue';

/**
 * Drives one marketing strategy run. The workflow chains six agents and takes
 * minutes, which is the whole reason it lives on the queue instead of the
 * request path.
 */
@Processor(STRATEGY_QUEUE)
export class StrategyProcessor extends WorkerHost {
  private readonly logger = new Logger(StrategyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastra: MastraClient,
    private readonly accounting: WorkflowAccountingService,
  ) {
    super();
  }

  async process(job: Job<StrategyJob>): Promise<void> {
    const { strategyId } = job.data;

    const strategy = await this.prisma.marketingStrategy.findUnique({
      where: { id: strategyId },
      include: {
        campaign: {
          select: {
            projectId: true,
            project: { select: { brandProfile: true } },
          },
        },
      },
    });

    if (!strategy) {
      this.logger.warn(`Strategy ${strategyId} no longer exists, dropping job`);
      return;
    }

    if (!strategy.runId) {
      // start() reserves the run id before enqueueing, so this only happens if
      // the row was tampered with. Fail loudly rather than reserving a second
      // run the caller was never told about.
      await this.fail(strategyId, 'No Mastra run id was reserved for this run');
      return;
    }

    const claimed = await this.prisma.marketingStrategy.updateMany({
      where: { id: strategyId, status: WorkflowRunStatus.PENDING },
      data: { status: WorkflowRunStatus.RUNNING },
    });
    await this.accounting
      .markRunning(strategy.runId)
      .catch((error) =>
        this.logger.warn(
          `Could not mark accounting for ${strategy.runId} as running: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    if (claimed.count === 0) {
      this.logger.log(
        `Strategy ${strategyId} is no longer pending; dropping queued job`,
      );
      return;
    }

    const { resume } = job.data;

    const readySources = await this.prisma.knowledgeSource.findMany({
      where: {
        projectId: strategy.campaign.projectId,
        status: KnowledgeSourceStatus.READY,
      },
      select: { id: true },
    });

    const workflow =
      job.data.workflow === 'section-revision'
        ? MASTRA_WORKFLOWS.strategySectionRevision
        : MASTRA_WORKFLOWS.strategy;

    const result = resume
      ? await this.mastra.resumeRun(
          workflow,
          strategy.runId,
          resume.step,
          resume.resumeData,
        )
      : await this.mastra.startRun(
          workflow,
          strategy.runId,
          job.data.workflow === 'section-revision'
            ? strategy.pendingRevision
            : {
                ...(strategy.input as Record<string, unknown>),
                // This value is derived from the owned campaign, never accepted
                // from a browser, so Mastra retrieval cannot cross project scope.
                knowledgeScope: {
                  projectId: strategy.campaign.projectId,
                  sourceIds: readySources.map((source) => source.id),
                },
                ...(strategy.campaign.project.brandProfile
                  ? { brandProfile: strategy.campaign.project.brandProfile }
                  : {}),
              },
          () => this.isCanceled(strategyId),
        );

    const status = toWorkflowRunStatus(result);

    // updateMany, not update: a run takes minutes, and the campaign can be
    // deleted while it is in flight. `update` throws on a missing row, which
    // would turn a completed run into a spurious job failure.
    const { count } = await this.prisma.marketingStrategy.updateMany({
      where: { id: strategyId, status: WorkflowRunStatus.RUNNING },
      data: {
        status,
        output:
          status === WorkflowRunStatus.READY
            ? (result.result as Prisma.InputJsonValue)
            : job.data.workflow === 'section-revision'
              ? (strategy.output ?? Prisma.DbNull)
              : Prisma.DbNull,
        pendingRevision: Prisma.DbNull,
        suspendPayload:
          status === WorkflowRunStatus.SUSPENDED
            ? ((result.suspended ??
                result.steps ??
                {}) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        error:
          status === WorkflowRunStatus.FAILED ? toErrorMessage(result) : null,
      },
    });

    if (count === 0) {
      this.logger.warn(
        `Strategy ${strategyId} was deleted or canceled while run ${strategy.runId} was in flight; discarding the ${status} result`,
      );
      return;
    }

    await this.accounting
      .markTerminal(strategy.runId, status)
      .catch((error) =>
        this.logger.warn(
          `Could not mark accounting for ${strategy.runId} as ${status}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    await this.accounting.collectOrSchedule(strategy.runId);

    this.logger.log(
      `Strategy ${strategyId} (run ${strategy.runId}) finished as ${status}`,
    );
  }

  /**
   * A thrown error means the run never produced a verdict — Mastra was
   * unreachable, timed out, or the worker died. There are no retries on this
   * queue, so this is the last word and the row must not be left RUNNING.
   */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<StrategyJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) {
      return;
    }

    const message = error?.message ?? String(error);
    this.logger.error(
      `Strategy run ${job.data.strategyId} failed: ${message}`,
      error?.stack,
    );

    await this.fail(job.data.strategyId, message);
  }

  private async fail(strategyId: string, message: string): Promise<void> {
    const strategy = await this.prisma.marketingStrategy.findUnique({
      where: { id: strategyId },
      select: { runId: true },
    });
    // updateMany rather than update: the row may have been deleted, and a
    // second throw inside the failure handler would be silently swallowed.
    const { count } = await this.prisma.marketingStrategy.updateMany({
      where: {
        id: strategyId,
        status: { in: [WorkflowRunStatus.PENDING, WorkflowRunStatus.RUNNING] },
      },
      data: {
        status: WorkflowRunStatus.FAILED,
        pendingRevision: Prisma.DbNull,
        error: message,
      },
    });

    if (count === 0) {
      this.logger.warn(`Could not mark strategy ${strategyId} as FAILED`);
      return;
    }
    if (strategy?.runId) {
      await this.accounting
        .markTerminal(strategy.runId, WorkflowRunStatus.FAILED)
        .catch(() => undefined);
      await this.accounting.collectOrSchedule(strategy.runId);
    }
  }

  private async isCanceled(strategyId: string): Promise<boolean> {
    const count = await this.prisma.marketingStrategy.count({
      where: { id: strategyId, status: WorkflowRunStatus.CANCELED },
    });
    return count > 0;
  }
}
