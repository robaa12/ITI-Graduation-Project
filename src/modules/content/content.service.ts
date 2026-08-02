import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GeneratedContent,
  GeneratedContentStatus,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { hasAnyValue } from '../../common/has-any-value';
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
        // No successful generation yet; the worker bumps this to 1 when the
        // agent delivers, so `version` always counts real outputs.
        version: 0,
        generationRevision: 1,
      },
    });

    await this.enqueue(record.id, record.generationRevision, false);

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

  /**
   * Manual edit of an agent output. Flags the row so it is not silently lost.
   *
   * An empty body is rejected rather than treated as an edit: `isEdited` is the
   * flag that stops `regenerate` from overwriting human work, so setting it for
   * a request that changed nothing would protect content nobody ever touched.
   *
   * Bumping the revision makes the edit win over any generation already in
   * flight. Without it a job that started before the edit would finish after
   * it, replace the text and clear `isEdited` — losing the edit silently.
   *
   * Superseding that job also means nothing is left to settle the row, so the
   * edit closes it out itself: hand-written content is READY by definition,
   * and a row that was PENDING or FAILED must not be stranded there.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateContentDto,
  ): Promise<GeneratedContent> {
    if (!hasAnyValue(dto)) {
      throw new BadRequestException('Provide at least one field to update');
    }

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
        generationRevision: { increment: 1 },
        status: GeneratedContentStatus.READY,
        error: null,
      },
    });
  }

  /**
   * Queues a re-run for an existing row, bumping its version on success. Manual
   * edits are overwritten, which is what "regenerate" means to the user. Like
   * {@link generate} this only enqueues and returns the PENDING row.
   *
   * The revision is reserved in the same statement that flips the row to
   * PENDING, so two concurrent requests come away with different numbers and
   * therefore different jobs. Reading it first and incrementing in JS would let
   * both land on the same value, and the queue would silently drop one of them.
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
        generationRevision: { increment: 1 },
      },
    });

    await this.enqueue(
      id,
      record.generationRevision,
      dto.usePrevious !== false,
    );

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
   * `jobId` is keyed to the reserved revision, which the database hands out one
   * at a time. Every accepted request therefore gets its own job — the id is an
   * idempotency key for retries of the *same* reservation, never a reason to
   * drop a distinct request.
   *
   * The separator is `-r` rather than `:` because BullMQ rejects colons in
   * custom job ids (they collide with its own Redis key namespacing).
   */
  private async enqueue(
    contentId: string,
    revision: number,
    usePrevious: boolean,
  ): Promise<void> {
    await this.queue.add(
      'generate',
      { contentId, revision, usePrevious },
      {
        jobId: `${contentId}-r${revision}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    );
  }
}
