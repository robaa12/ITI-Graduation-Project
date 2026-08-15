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
  GenerationCreditKind,
  MarketingStrategy,
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
import { presentWorkflowAccounting } from '../workflow-accounting/workflow-accounting.presenter';
import { WorkflowAccountingService } from '../workflow-accounting/workflow-accounting.service';
import { QueryStrategyDto } from './dto/query-strategy.dto';
import { ReviewStrategyDto } from './dto/review-strategy.dto';
import { RegenerateStrategySectionDto } from './dto/regenerate-strategy-section.dto';
import { STRATEGY_QUEUE, StrategyJob } from './strategy.queue';

/**
 * The Mastra workflow owns its own input schema, so the request body is
 * forwarded untouched and Mastra's zod validation is the only one that applies.
 * This cap is the single thing enforced here — without it an unbounded blob
 * would be persisted and shipped over the wire to Mastra.
 */
const MAX_WORKFLOW_INPUT_BYTES = 64 * 1024;
// Completed strategies contain all upstream artefacts as well as the campaign
// plan, so they are substantially larger than the initial brief. Leave room
// below the 256 KiB HTTP body limit for the action, note, and JSON wrapper.
const MAX_REVIEW_OUTPUT_BYTES = 240 * 1024;

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    @InjectQueue(STRATEGY_QUEUE)
    private readonly queue: Queue<StrategyJob>,
    private readonly mastra: MastraClient,
    private readonly generationCredits: GenerationCreditsService,
    private readonly accounting: WorkflowAccountingService,
  ) {}

  /**
   * Starts a marketing strategy run for a campaign and returns immediately.
   *
   * Generate the Mastra run id locally and persist it before dispatch. The
   * worker passes that id to Mastra's start endpoint, which creates and starts
   * exactly one run. Calling Mastra's `create-run` here as well would create a
   * second, permanently pending Studio run.
   */
  async start(
    userId: string,
    campaignId: string,
    input: Record<string, unknown>,
  ): Promise<MarketingStrategy> {
    const campaign = await this.campaignsService.findOwnedOrFail(
      userId,
      campaignId,
    );

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    let temporalContext;
    try {
      temporalContext = buildWorkflowTemporalContext(campaign);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
    const authoritativeInput = { ...input, temporalContext };

    if (jsonByteLength(authoritativeInput) > MAX_WORKFLOW_INPUT_BYTES) {
      throw new BadRequestException(
        `Workflow input must serialise to at most ${MAX_WORKFLOW_INPUT_BYTES} bytes`,
      );
    }

    // Written before the worker contacts Mastra so any startup failure is
    // recorded against a row the client can actually inspect.
    const runId = randomUUID();
    const record = await this.prisma.$transaction(async (tx) => {
      const strategy = await tx.marketingStrategy.create({
        data: {
          campaignId,
          runId,
          input: authoritativeInput,
          status: WorkflowRunStatus.PENDING,
        },
      });
      await this.generationCredits.consumeInTransaction(
        tx,
        userId,
        GenerationCreditKind.STRATEGY,
        strategyCreditReference(runId),
      );
      await tx.workflowExecution.create({
        data: {
          mastraRunId: runId,
          workflowId: MASTRA_WORKFLOWS.strategy,
          kind: WorkflowExecutionKind.STRATEGY,
          strategyId: strategy.id,
        },
      });
      return strategy;
    });

    try {
      await this.queue.add(
        'run',
        { strategyId: record.id },
        {
          // Keyed to the row, so a double submit cannot start the same run twice.
          jobId: `strategy-${record.id}`,
          // Deliberately no retries: a workflow run costs real agent calls and
          // minutes of work, and a lost response does not mean it did not
          // happen. Re-running is the caller's explicit decision, not the
          // queue's — they POST again and get a fresh run.
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.marketingStrategy.updateMany({
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
      await this.generationCredits.refund(strategyCreditReference(runId));

      this.logger.error(`Could not enqueue strategy ${record.id}: ${message}`);
      throw new ServiceUnavailableException(
        'The workflow queue is unavailable, please retry',
      );
    }

    return record;
  }

  /**
   * Resumes a suspended run.
   *
   * The claim is a conditional update on SUSPENDED, so two clients answering
   * the same suspension race in the database and exactly one wins — the loser
   * gets a 409 instead of queueing a second resume for a run already moving.
   */
  async resume(
    userId: string,
    id: string,
    body: unknown,
  ): Promise<MarketingStrategy> {
    const strategy = await this.findOwnedOrFail(userId, id);
    const resume = parseResumeRequest(body);

    if (!strategy.runId) {
      throw new ConflictException(`Strategy ${id} has no Mastra run to resume`);
    }
    const mastraRunId = strategy.runId;

    const count = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.marketingStrategy.updateMany({
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
        `Strategy ${id} is ${strategy.status}; only a SUSPENDED run can be resumed`,
      );
    }

    try {
      await this.queue.add(
        'resume',
        { strategyId: id, resume },
        {
          // A run can suspend and resume repeatedly, so the id has to be unique
          // per attempt. Double submits are already excluded by the conditional
          // claim above, which is the guard that actually matters here.
          jobId: `strategy-${id}-resume-${randomUUID()}`,
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      // The claim already moved the row off SUSPENDED. If the job never made it
      // onto the queue, put it back so the suspension stays answerable.
      await this.prisma.marketingStrategy.updateMany({
        where: { id, status: WorkflowRunStatus.PENDING },
        data: {
          status: WorkflowRunStatus.SUSPENDED,
          suspendPayload: strategy.suspendPayload ?? Prisma.DbNull,
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

  async findAll(userId: string, campaignId: string, query: QueryStrategyDto) {
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    const where: Prisma.MarketingStrategyWhereInput = {
      campaignId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.marketingStrategy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.marketingStrategy.count({ where }),
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
    const strategy = await this.findOwnedOrFail(userId, id);
    const storedExecutions = await this.prisma.workflowExecution.findMany({
      where: { strategyId: id },
      orderBy: { createdAt: 'asc' },
    });
    const executions =
      await this.accounting.reconcileForPresentation(storedExecutions);
    return { ...strategy, ...presentWorkflowAccounting(executions) };
  }

  /**
   * Persists a human review and, on approval, the exact edited draft that will
   * be handed to the content workflow. This closes the former browser-only
   * approval gap where changes could disappear on refresh.
   */
  async review(
    user: { id: string; name: string },
    id: string,
    dto: ReviewStrategyDto,
  ): Promise<MarketingStrategy> {
    const strategy = await this.findOwnedOrFail(user.id, id);

    if (strategy.status !== WorkflowRunStatus.READY) {
      throw new ConflictException(
        `Strategy ${id} is ${strategy.status}; only a READY strategy can be reviewed`,
      );
    }

    if (dto.action === StrategyApprovalStatus.APPROVED && !dto.output) {
      throw new BadRequestException(
        'An edited strategy output is required for approval',
      );
    }

    if (dto.output && jsonByteLength(dto.output) > MAX_REVIEW_OUTPUT_BYTES) {
      throw new BadRequestException(
        `Reviewed strategy must serialise to at most ${MAX_REVIEW_OUTPUT_BYTES} bytes`,
      );
    }

    const output = dto.output
      ? (dto.output as Prisma.InputJsonValue)
      : undefined;
    const reviewedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketingStrategy.update({
        where: { id },
        data: {
          approvalStatus: dto.action,
          reviewedAt,
          reviewerId: user.id,
          reviewerName: user.name,
          reviewNote: dto.note?.trim() || null,
          ...(output ? { output } : {}),
        },
      });

      await tx.strategyReviewEvent.create({
        data: {
          strategyId: id,
          action: dto.action,
          note: dto.note?.trim() || null,
          reviewerId: user.id,
          reviewerName: user.name,
          ...(output ? { output } : {}),
        },
      });

      return updated;
    });
  }

  async listReviews(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);
    return this.prisma.strategyReviewEvent.findMany({
      where: { strategyId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        note: true,
        reviewerName: true,
        createdAt: true,
      },
    });
  }

  /** Queues a focused revision while keeping this strategy id as the durable record. */
  async regenerateSection(
    user: { id: string; name: string },
    id: string,
    dto: RegenerateStrategySectionDto,
  ): Promise<MarketingStrategy> {
    const strategy = await this.findOwnedOrFail(user.id, id);
    if (
      (strategy.status !== WorkflowRunStatus.READY &&
        strategy.status !== WorkflowRunStatus.FAILED) ||
      !strategy.output
    ) {
      throw new ConflictException(
        `Strategy ${id} must be READY before a section can be regenerated`,
      );
    }

    const campaign = await this.campaignsService.findOwnedOrFail(
      user.id,
      strategy.campaignId,
    );
    let temporalContext;
    try {
      temporalContext = buildWorkflowTemporalContext(campaign);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }

    const revisionInput = {
      strategy: strategy.output,
      section: dto.section,
      feedback: dto.feedback.trim(),
      temporalContext,
    };

    const revisionRunId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.marketingStrategy.updateMany({
        where: {
          id,
          status: { in: [WorkflowRunStatus.READY, WorkflowRunStatus.FAILED] },
        },
        data: {
          pendingRevision: revisionInput,
          runId: revisionRunId,
          status: WorkflowRunStatus.PENDING,
          approvalStatus: StrategyApprovalStatus.PENDING_REVIEW,
          reviewedAt: null,
          reviewerId: null,
          reviewerName: null,
          reviewNote: null,
          error: null,
        },
      });
      if (count === 0) {
        throw new ConflictException(`Strategy ${id} is already being updated`);
      }
      await this.generationCredits.consumeInTransaction(
        tx,
        user.id,
        GenerationCreditKind.STRATEGY_SECTION_REVISION,
        strategyRevisionCreditReference(revisionRunId),
      );
      await tx.workflowExecution.create({
        data: {
          mastraRunId: revisionRunId,
          workflowId: MASTRA_WORKFLOWS.strategySectionRevision,
          kind: WorkflowExecutionKind.STRATEGY_SECTION_REVISION,
          strategyId: id,
        },
      });
      await tx.strategyReviewEvent.create({
        data: {
          strategyId: id,
          action: StrategyApprovalStatus.CHANGES_REQUESTED,
          note: `Regenerate ${dto.section}: ${dto.feedback.trim()}`,
          reviewerId: user.id,
          reviewerName: user.name,
          output: strategy.output as Prisma.InputJsonValue,
        },
      });
    });

    try {
      await this.queue.add(
        'section-revision',
        { strategyId: id, workflow: 'section-revision' },
        {
          jobId: `strategy-${id}-section-${randomUUID()}`,
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      await this.prisma.marketingStrategy.updateMany({
        where: { id, status: WorkflowRunStatus.PENDING },
        data: {
          status: WorkflowRunStatus.READY,
          pendingRevision: Prisma.DbNull,
          runId: strategy.runId,
        },
      });
      await this.prisma.workflowExecution.updateMany({
        where: { mastraRunId: revisionRunId },
        data: {
          status: WorkflowRunStatus.FAILED,
          accountingStatus: WorkflowAccountingStatus.UNAVAILABLE,
          finishedAt: new Date(),
        },
      });
      await this.generationCredits.refund(
        strategyRevisionCreditReference(revisionRunId),
      );
      throw error;
    }

    return this.findOwnedOrFail(user.id, id);
  }

  /**
   * Claims cancellation in Postgres before asking Mastra to stop. Workers only
   * write results while a row is RUNNING, so a late completion cannot bring a
   * canceled run back to life.
   */
  async cancel(userId: string, id: string): Promise<MarketingStrategy> {
    const strategy = await this.findOwnedOrFail(userId, id);

    if (strategy.status === WorkflowRunStatus.CANCELED) {
      return strategy;
    }

    const cancellable: WorkflowRunStatus[] = [
      WorkflowRunStatus.PENDING,
      WorkflowRunStatus.RUNNING,
      WorkflowRunStatus.SUSPENDED,
    ];
    if (!cancellable.includes(strategy.status)) {
      throw new ConflictException(
        `Strategy ${id} is ${strategy.status}; only an active run can be canceled`,
      );
    }

    const { count } = await this.prisma.marketingStrategy.updateMany({
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
        `Strategy ${id} finished before it could be canceled`,
      );
    }

    if (strategy.runId && strategy.status !== WorkflowRunStatus.PENDING) {
      try {
        await this.mastra.cancelRun(MASTRA_WORKFLOWS.strategy, strategy.runId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The durable CANCELED claim still prevents the worker from publishing
        // a result. This is especially important when Mastra is restarting.
        this.logger.warn(
          `Strategy ${id} was canceled locally but Mastra run ${strategy.runId} could not be stopped immediately: ${message}`,
        );
      }
    }

    if (strategy.runId) {
      await Promise.all([
        this.generationCredits.refund(strategyCreditReference(strategy.runId)),
        this.generationCredits.refund(
          strategyRevisionCreditReference(strategy.runId),
        ),
      ]);
    }

    return this.findOwnedOrFail(userId, id);
  }

  /** Ownership reaches through campaign → project → user, same as content. */
  async findOwnedOrFail(
    userId: string,
    id: string,
  ): Promise<MarketingStrategy> {
    const strategy = await this.prisma.marketingStrategy.findFirst({
      where: { id, campaign: { project: { userId } } },
    });

    if (!strategy) {
      throw new NotFoundException(`Marketing strategy ${id} not found`);
    }

    return strategy;
  }
}

export function strategyCreditReference(runId: string): string {
  return `strategy:${runId}`;
}

export function strategyRevisionCreditReference(runId: string): string {
  return `strategy-revision:${runId}`;
}
