import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
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
import { MastraClient } from '../mastra/mastra.client';
import { MASTRA_WORKFLOWS } from '../mastra/mastra.types';
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
    private readonly mastra: MastraClient,
    @InjectQueue(STRATEGY_QUEUE)
    private readonly queue: Queue<StrategyJob>,
  ) {}

  /**
   * Starts a marketing strategy run for a campaign and returns immediately.
   *
   * The Mastra run id is reserved here rather than in the worker so the caller
   * gets it in the 202 — it is one cheap call, unlike the run itself. A Mastra
   * that cannot be reached therefore fails the request outright instead of
   * queueing work that was never going to start.
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

    // Written before the run is reserved: if the reservation blows up, the
    // failure is recorded against a row the client can actually look at.
    const record = await this.prisma.marketingStrategy.create({
      data: {
        campaignId,
        input: input as Prisma.InputJsonValue,
        status: WorkflowRunStatus.PENDING,
      },
    });

    let runId: string;
    try {
      runId = await this.mastra.createRun(MASTRA_WORKFLOWS.strategy);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.marketingStrategy.update({
        where: { id: record.id },
        data: { status: WorkflowRunStatus.FAILED, error: message },
      });

      this.logger.error(
        `Could not reserve a Mastra run for strategy ${record.id}: ${message}`,
      );
      throw new ServiceUnavailableException(
        'The workflow service is unavailable, please retry',
      );
    }

    const withRun = await this.prisma.marketingStrategy.update({
      where: { id: record.id },
      data: { runId },
    });

    await this.queue.add(
      'run',
      { strategyId: record.id },
      {
        // Keyed to the row, so a double submit cannot start the same run twice.
        jobId: `strategy-${record.id}`,
        // Deliberately no retries: a workflow run costs real agent calls and
        // minutes of work, and a lost response does not mean the run did not
        // happen. Re-running is the caller's explicit decision, not the
        // queue's — they POST again and get a fresh run.
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    );

    return withRun;
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
