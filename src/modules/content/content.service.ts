import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GeneratedContent,
  GeneratedContentStatus,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentExportService, ExportedFile } from './content-export.service';
import {
  CONTENT_GENERATION_QUEUE,
  ContentGenerationJob,
} from './content-generation.queue';
import { ExportFormat } from './dto/export-content.dto';
import { GenerateContentDto } from './dto/generate-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { RegenerateContentDto } from './dto/regenerate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly exportService: ContentExportService,
    @InjectQueue(CONTENT_GENERATION_QUEUE)
    private readonly queue: Queue<ContentGenerationJob>,
  ) {}

  /** Exports every generated output of a campaign as one downloadable file. */
  async exportCampaign(
    userId: string,
    campaignId: string,
    format: ExportFormat,
  ): Promise<ExportedFile> {
    const campaign = await this.campaignsService.findOwnedOrFail(
      userId,
      campaignId,
    );

    const contents = await this.prisma.generatedContent.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });

    return this.exportService.export(contents, format, campaign.name);
  }

  async exportOne(
    userId: string,
    id: string,
    format: ExportFormat,
  ): Promise<ExportedFile> {
    const content = await this.findOwnedOrFail(userId, id);

    return this.exportService.export(
      [content],
      format,
      content.title ?? content.type,
    );
  }

  /**
   * Queues a generation and returns the PENDING row immediately. The agent
   * never runs on the request thread, so a client disconnect cannot abandon it
   * — clients poll `findOne` (or list by status) until it turns READY/FAILED.
   */
  async generate(
    userId: string,
    campaignId: string,
    dto: GenerateContentDto,
  ): Promise<GeneratedContent> {
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    const record = await this.prisma.generatedContent.create({
      data: {
        campaignId,
        type: dto.type,
        prompt: dto.instructions,
        status: GeneratedContentStatus.PENDING,
      },
    });

    await this.enqueue(record.id, record.version, false);

    return record;
  }

  async findAll(userId: string, campaignId: string, query: QueryContentDto) {
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    const where: Prisma.GeneratedContentWhereInput = {
      campaignId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.generatedContent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.generatedContent.count({ where }),
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

  async findOne(userId: string, id: string): Promise<GeneratedContent> {
    return this.findOwnedOrFail(userId, id);
  }

  /** Manual edit of an agent output. Flags the row so it is not silently lost. */
  async update(
    userId: string,
    id: string,
    dto: UpdateContentDto,
  ): Promise<GeneratedContent> {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.generatedContent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.payload !== undefined
          ? { payload: dto.payload as Prisma.InputJsonValue }
          : {}),
        isEdited: true,
      },
    });
  }

  /**
   * Queues a re-run for an existing row, bumping its version on success. Manual
   * edits are overwritten, which is what "regenerate" means to the user. Like
   * {@link generate} this only enqueues and returns the PENDING row.
   */
  async regenerate(
    userId: string,
    id: string,
    dto: RegenerateContentDto,
  ): Promise<GeneratedContent> {
    const existing = await this.findOwnedOrFail(userId, id);
    const instructions = dto.instructions ?? existing.prompt ?? undefined;

    const record = await this.prisma.generatedContent.update({
      where: { id },
      data: {
        status: GeneratedContentStatus.PENDING,
        prompt: instructions,
        error: null,
      },
    });

    await this.enqueue(id, existing.version + 1, dto.usePrevious !== false);

    return record;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnedOrFail(userId, id);

    await this.prisma.generatedContent.delete({ where: { id } });
  }

  /** Ownership check reaching through campaign → project → user. */
  async findOwnedOrFail(userId: string, id: string): Promise<GeneratedContent> {
    const content = await this.prisma.generatedContent.findFirst({
      where: { id, campaign: { project: { userId } } },
    });

    if (!content) {
      throw new NotFoundException(`Generated content ${id} not found`);
    }

    return content;
  }

  /**
   * `jobId` keys the job to the exact row+version it produces, so a double
   * submit is dropped by the queue instead of paying for the agent twice.
   * Failed jobs are removed once their retries are exhausted, which is what
   * frees that key again for a genuine user-initiated retry.
   *
   * The separator is `-v` rather than `:` because BullMQ rejects colons in
   * custom job ids (they collide with its own Redis key namespacing).
   */
  private async enqueue(
    contentId: string,
    version: number,
    usePrevious: boolean,
  ): Promise<void> {
    await this.queue.add(
      'generate',
      { contentId, version, usePrevious },
      {
        jobId: `${contentId}-v${version}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: true,
      },
    );
  }
}
