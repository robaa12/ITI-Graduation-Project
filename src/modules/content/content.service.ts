import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ContentFormat,
  GeneratedContent,
  GeneratedContentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentExportService, ExportedFile } from './content-export.service';
import { ExportFormat } from './dto/export-content.dto';
import { GenerateContentDto } from './dto/generate-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { RegenerateContentDto } from './dto/regenerate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { CONTENT_GENERATOR } from './generator/content-generator.port';
import type {
  ContentGenerationBrief,
  ContentGeneratorPort,
  GeneratedContentDraft,
} from './generator/content-generator.port';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly exportService: ContentExportService,
    @Inject(CONTENT_GENERATOR)
    private readonly generator: ContentGeneratorPort,
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
   * Asks the generation agent for a new output and stores it. A failing agent
   * is recorded as a FAILED row rather than losing the request, so the client
   * can show the error and retry with `regenerate`.
   */
  async generate(
    userId: string,
    campaignId: string,
    dto: GenerateContentDto,
  ): Promise<GeneratedContent> {
    await this.campaignsService.findOwnedOrFail(userId, campaignId);

    const brief = await this.buildBrief(campaignId, dto.type, dto.instructions);

    const record = await this.prisma.generatedContent.create({
      data: {
        campaignId,
        type: dto.type,
        prompt: dto.instructions,
        status: GeneratedContentStatus.PENDING,
      },
    });

    return this.runGeneration(record.id, brief, record.version);
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
   * Re-runs the agent for an existing row, bumping its version. Manual edits
   * are overwritten, which is what "regenerate" means to the user.
   */
  async regenerate(
    userId: string,
    id: string,
    dto: RegenerateContentDto,
  ): Promise<GeneratedContent> {
    const existing = await this.findOwnedOrFail(userId, id);
    const instructions = dto.instructions ?? existing.prompt ?? undefined;

    const brief = await this.buildBrief(
      existing.campaignId,
      existing.type,
      instructions,
      dto.usePrevious === false
        ? null
        : {
            title: existing.title,
            body: existing.body,
            payload: existing.payload,
          },
    );

    await this.prisma.generatedContent.update({
      where: { id },
      data: {
        status: GeneratedContentStatus.PENDING,
        prompt: instructions,
        error: null,
      },
    });

    return this.runGeneration(id, brief, existing.version + 1);
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

  /** Loads everything the agent needs about the campaign and its project. */
  private async buildBrief(
    campaignId: string,
    type: string,
    instructions?: string,
    previous?: ContentGenerationBrief['previous'],
  ): Promise<ContentGenerationBrief> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { project: true },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    return {
      project: {
        id: campaign.project.id,
        name: campaign.project.name,
        description: campaign.project.description,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        objective: campaign.objective,
        audience: campaign.audience,
        tone: campaign.tone,
        channels: campaign.channels,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      },
      type,
      instructions,
      previous,
    };
  }

  private async runGeneration(
    id: string,
    brief: ContentGenerationBrief,
    version: number,
  ): Promise<GeneratedContent> {
    try {
      const draft = await this.generator.generate(brief);

      return await this.prisma.generatedContent.update({
        where: { id },
        data: {
          type: draft.type || brief.type,
          title: draft.title ?? null,
          body: draft.body ?? null,
          payload: this.toJsonInput(draft),
          format: draft.format ?? ContentFormat.TEXT,
          model: draft.model ?? null,
          status: GeneratedContentStatus.READY,
          error: null,
          version,
          isEdited: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Generation failed for content ${id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.prisma.generatedContent.update({
        where: { id },
        data: { status: GeneratedContentStatus.FAILED, error: message },
      });
    }
  }

  private toJsonInput(
    draft: GeneratedContentDraft,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    return draft.payload === undefined || draft.payload === null
      ? Prisma.DbNull
      : draft.payload;
  }
}
