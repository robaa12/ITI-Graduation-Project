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
import { MarketingStrategy, Prisma, WorkflowRunStatus } from '@prisma/client';
import { Queue } from 'bullmq';

import { jsonByteLength } from '../../common/validators/max-json-size.validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { parseResumeRequest } from '../mastra/resume-request';
import { QueryStrategyDto } from './dto/query-strategy.dto';
import { STRATEGY_QUEUE, StrategyJob } from './strategy.queue';

/**
 * The Mastra workflow owns its own input schema, so the request body is
 * forwarded untouched and Mastra's zod validation is the only one that applies.
 * This cap is the single thing enforced here — without it an unbounded blob
 * would be persisted and shipped over the wire to Mastra.
 */
const MAX_INPUT_BYTES = 64 * 1024;

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    @InjectQueue(STRATEGY_QUEUE)
    private readonly queue: Queue<StrategyJob>,
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
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    if (jsonByteLength(input) > MAX_INPUT_BYTES) {
      throw new BadRequestException(
        `Workflow input must serialise to at most ${MAX_INPUT_BYTES} bytes`,
      );
    }

    // Written before the worker contacts Mastra so any startup failure is
    // recorded against a row the client can actually inspect.
    const record = await this.prisma.marketingStrategy.create({
      data: {
        campaignId,
        runId: randomUUID(),
        input: input as Prisma.InputJsonValue,
        status: WorkflowRunStatus.PENDING,
      },
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

      this.logger.error(
        `Could not enqueue strategy ${record.id}: ${message}`,
      );
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

    const { count } = await this.prisma.marketingStrategy.updateMany({
      where: { id, status: WorkflowRunStatus.SUSPENDED },
      data: {
        status: WorkflowRunStatus.PENDING,
        suspendPayload: Prisma.DbNull,
        error: null,
      },
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

  async findOne(userId: string, id: string): Promise<MarketingStrategy> {
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
