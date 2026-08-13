import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CampaignContentRun,
  GenerationCreditKind,
  Prisma,
  StrategyApprovalStatus,
  WorkflowAccountingStatus,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { jsonByteLength } from '../../common/validators/max-json-size.validator';
import { buildWorkflowTemporalContext } from '../../common/workflow-temporal-context';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { GenerationCreditsService } from '../generation-credits/generation-credits.service';
import { MastraClient } from '../mastra/mastra.client';
import { MASTRA_WORKFLOWS } from '../mastra/mastra.types';
import { parseResumeRequest } from '../mastra/resume-request';
import { StrategyService } from '../strategy/strategy.service';
import { presentWorkflowAccounting } from '../workflow-accounting/workflow-accounting.presenter';
import {
  CONTENT_WORKFLOW_QUEUE,
  ContentWorkflowJob,
} from './content-workflow.queue';
import { validateContentWorkflowInput } from './content-workflow-input.validator';
import { QueryContentRunDto } from './dto/query-content-run.dto';

const MAX_INPUT_BYTES = 256 * 1024;

@Injectable()
export class ContentWorkflowService {
  private readonly logger = new Logger(ContentWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly strategyService: StrategyService,
    @InjectQueue(CONTENT_WORKFLOW_QUEUE)
    private readonly queue: Queue<ContentWorkflowJob>,
    private readonly mastra: MastraClient,
    private readonly generationCredits: GenerationCreditsService,
  ) {}

  /**
   * Starts a content run for a campaign and returns immediately.
   *
   * `strategyId` is the link the whole feature exists for: the campaignStrategy
   * produced by a finished strategy run is folded into the input so the content
   * is written against it. Everything else in the body is forwarded untouched —
   * the Mastra workflow owns that schema.
   */
  async start(
    userId: string,
    campaignId: string,
    body: Record<string, unknown>,
  ): Promise<CampaignContentRun> {
    const campaign = await this.campaignsService.findOwnedOrFail(
      userId,
      campaignId,
    );

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const { strategyId, input: untrustedInput } = await this.buildInput(
      userId,
      campaignId,
      body,
    );
    let temporalContext;
    try {
      temporalContext = buildWorkflowTemporalContext(campaign);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
    const input = { ...untrustedInput, temporalContext };

    validateContentWorkflowInput(input);

    if (jsonByteLength(input) > MAX_INPUT_BYTES) {
      throw new BadRequestException(
        `Workflow input must serialise to at most ${MAX_INPUT_BYTES} bytes`,
      );
    }

    // The worker creates and starts this exact ID at Mastra, keeping Studio,
    // the queue job, and this database row attached to one execution.
    const runId = randomUUID();
    const record = await this.prisma.$transaction(async (tx) => {
      const contentRun = await tx.campaignContentRun.create({
        data: {
          campaignId,
          strategyId,
          runId,
          input: input as Prisma.InputJsonValue,
          status: WorkflowRunStatus.PENDING,
        },
      });
      await this.generationCredits.consumeInTransaction(
        tx,
        userId,
        GenerationCreditKind.CONTENT_WORKFLOW,
        contentWorkflowCreditReference(runId),
      );
      await tx.workflowExecution.create({
        data: {
          mastraRunId: runId,
          workflowId: MASTRA_WORKFLOWS.content,
          kind: WorkflowExecutionKind.CONTENT,
          contentRunId: contentRun.id,
        },
      });
      return contentRun;
    });

    try {
      await this.queue.add(
        'run',
        { contentRunId: record.id },
        {
          jobId: `content-run-${record.id}`,
          // Same reasoning as the strategy queue: a run is expensive and a lost
          // response does not mean it did not happen, so retrying is the
          // caller's call, not the queue's.
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.campaignContentRun.updateMany({
        where: { id: record.id },
        data: { status: WorkflowRunStatus.FAILED, error: message },
      });
      await this.prisma.workflowExecution.updateMany({
        where: { mastraRunId: runId },
        data: {
          status: WorkflowRunStatus.FAILED,
          accountingStatus: WorkflowAccountingStatus.UNAVAILABLE,
          finishedAt: new Date(),
        },
      });
      await this.generationCredits.refund(
        contentWorkflowCreditReference(runId),
      );

      this.logger.error(
        `Could not enqueue content run ${record.id}: ${message}`,
      );
      throw new ServiceUnavailableException(
        'The workflow queue is unavailable, please retry',
      );
    }

    return record;
  }

  /**
   * Folds the stored strategy into the request body.
   *
   * `strategyId` is optional: a caller that already holds a campaignStrategy
   * can post it directly. When it is present the stored one always wins — the
   * point of passing an id is to run against that exact strategy, so silently
   * honouring a conflicting inline copy would defeat it.
   */
  private async buildInput(
    userId: string,
    campaignId: string,
    body: Record<string, unknown>,
  ): Promise<{ strategyId: string | null; input: Record<string, unknown> }> {
    const { strategyId: rawId, ...rest } = body;

    if (rawId === undefined || rawId === null) {
      return { strategyId: null, input: rest };
    }

    if (typeof rawId !== 'string') {
      throw new BadRequestException('strategyId must be a string');
    }

    const strategy = await this.strategyService.findOwnedOrFail(userId, rawId);

    if (strategy.campaignId !== campaignId) {
      throw new ConflictException(
        `Strategy ${rawId} belongs to a different campaign`,
      );
    }

    if (strategy.status !== WorkflowRunStatus.READY) {
      throw new ConflictException(
        `Strategy ${rawId} is ${strategy.status}; content can only be generated from a READY strategy`,
      );
    }

    if (strategy.approvalStatus !== StrategyApprovalStatus.APPROVED) {
      throw new ConflictException(
        `Strategy ${rawId} must be approved before content can be generated`,
      );
    }

    const campaignStrategy = (
      strategy.output as { campaignStrategy?: unknown } | null
    )?.campaignStrategy;

    if (!campaignStrategy) {
      throw new ConflictException(
        `Strategy ${rawId} finished without a campaignStrategy to build content from`,
      );
    }

    return {
      strategyId: rawId,
      input: { ...rest, campaignStrategy },
    };
  }

  /**
   * Answers a suspension — the content workflow pauses here when it was started
   * with `requireApproval`. The claim is a conditional update on SUSPENDED, so
   * two reviewers approving at once race in the database and only one wins.
   */
  async resume(
    userId: string,
    id: string,
    body: unknown,
  ): Promise<CampaignContentRun> {
    const run = await this.findOwnedOrFail(userId, id);
    const resume = parseResumeRequest(body);

    if (!run.runId) {
      throw new ConflictException(
        `Content run ${id} has no Mastra run to resume`,
      );
    }
    const mastraRunId = run.runId;

    const count = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.campaignContentRun.updateMany({
        where: { id, status: WorkflowRunStatus.SUSPENDED },
        data: {
          status: WorkflowRunStatus.PENDING,
          suspendPayload: Prisma.DbNull,
          error: null,
        },
      });
      if (claimed.count > 0) {
        await tx.workflowExecution.updateMany({
          where: { mastraRunId },
          data: {
            accountingStatus: WorkflowAccountingStatus.PENDING,
            usageCollectedAt: null,
          },
        });
      }
      return claimed.count;
    });

    if (count === 0) {
      throw new ConflictException(
        `Content run ${id} is ${run.status}; only a SUSPENDED run can be resumed`,
      );
    }

    try {
      await this.queue.add(
        'resume',
        { contentRunId: id, resume },
        {
          // Unique per attempt: a run can suspend and resume more than once.
          // The conditional claim above is what excludes double submits.
          jobId: `content-run-${id}-resume-${randomUUID()}`,
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      // The claim already moved the row off SUSPENDED; restore it so the
      // suspension stays answerable.
      await this.prisma.campaignContentRun.updateMany({
        where: { id, status: WorkflowRunStatus.PENDING },
        data: {
          status: WorkflowRunStatus.SUSPENDED,
          suspendPayload: run.suspendPayload ?? Prisma.DbNull,
        },
      });
      await this.prisma.workflowExecution.updateMany({
        where: { mastraRunId },
        data: { accountingStatus: WorkflowAccountingStatus.UNAVAILABLE },
      });
      throw error;
    }

    return this.findOwnedOrFail(userId, id);
  }

  async findAll(userId: string, campaignId: string, query: QueryContentRunDto) {
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    const where: Prisma.CampaignContentRunWhereInput = {
      campaignId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaignContentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.campaignContentRun.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(userId: string, id: string) {
    const run = await this.findOwnedOrFail(userId, id);
    const executions = await this.prisma.workflowExecution.findMany({
      where: { contentRunId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...run, ...presentWorkflowAccounting(executions) };
  }

  async cancel(userId: string, id: string): Promise<CampaignContentRun> {
    const run = await this.findOwnedOrFail(userId, id);

    if (run.status === WorkflowRunStatus.CANCELED) {
      return run;
    }

    const cancellable: WorkflowRunStatus[] = [
      WorkflowRunStatus.PENDING,
      WorkflowRunStatus.RUNNING,
      WorkflowRunStatus.SUSPENDED,
    ];
    if (!cancellable.includes(run.status)) {
      throw new ConflictException(
        `Content run ${id} is ${run.status}; only an active run can be canceled`,
      );
    }

    const { count } = await this.prisma.campaignContentRun.updateMany({
      where: { id, status: { in: cancellable } },
      data: {
        status: WorkflowRunStatus.CANCELED,
        error: null,
        suspendPayload: Prisma.DbNull,
      },
    });

    if (count === 0) {
      const current = await this.findOwnedOrFail(userId, id);
      if (current.status === WorkflowRunStatus.CANCELED) return current;
      throw new ConflictException(
        `Content run ${id} finished before it could be canceled`,
      );
    }

    if (run.runId && run.status !== WorkflowRunStatus.PENDING) {
      try {
        await this.mastra.cancelRun(MASTRA_WORKFLOWS.content, run.runId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Content run ${id} was canceled locally but Mastra run ${run.runId} could not be stopped immediately: ${message}`,
        );
      }
    }

    if (run.runId) {
      await this.generationCredits.refund(
        contentWorkflowCreditReference(run.runId),
      );
    }

    return this.findOwnedOrFail(userId, id);
  }

  async findOwnedOrFail(
    userId: string,
    id: string,
  ): Promise<CampaignContentRun> {
    const run = await this.prisma.campaignContentRun.findFirst({
      where: { id, campaign: { project: { userId } } },
    });

    if (!run) {
      throw new NotFoundException(`Content run ${id} not found`);
    }

    return run;
  }
}

export function contentWorkflowCreditReference(runId: string): string {
  return `content-workflow:${runId}`;
}
