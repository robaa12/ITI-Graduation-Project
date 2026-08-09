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
import { CampaignContentRun, Prisma, WorkflowRunStatus } from '@prisma/client';
import { Queue } from 'bullmq';

import { jsonByteLength } from '../../common/validators/max-json-size.validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { parseResumeRequest } from '../mastra/resume-request';
import { StrategyService } from '../strategy/strategy.service';
import {
  CONTENT_WORKFLOW_QUEUE,
  ContentWorkflowJob,
} from './content-workflow.queue';
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
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const { strategyId, input } = await this.buildInput(
      userId,
      campaignId,
      body,
    );

    if (jsonByteLength(input) > MAX_INPUT_BYTES) {
      throw new BadRequestException(
        `Workflow input must serialise to at most ${MAX_INPUT_BYTES} bytes`,
      );
    }

    // The worker creates and starts this exact ID at Mastra, keeping Studio,
    // the queue job, and this database row attached to one execution.
    const record = await this.prisma.campaignContentRun.create({
      data: {
        campaignId,
        strategyId,
        runId: randomUUID(),
        input: input as Prisma.InputJsonValue,
        status: WorkflowRunStatus.PENDING,
      },
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

    const { count } = await this.prisma.campaignContentRun.updateMany({
      where: { id, status: WorkflowRunStatus.SUSPENDED },
      data: {
        status: WorkflowRunStatus.PENDING,
        suspendPayload: Prisma.DbNull,
        error: null,
      },
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

  async findOne(userId: string, id: string): Promise<CampaignContentRun> {
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
