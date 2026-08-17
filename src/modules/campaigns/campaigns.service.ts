import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Campaign, CampaignStatus, Prisma } from '@prisma/client';

import { hasAnyValue } from '../../common/has-any-value';
import { PrismaService } from '../../prisma/prisma.service';
import { MastraClient } from '../mastra/mastra.client';
import { ProjectsService } from '../projects/projects.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { GenerateCampaignTitleDto } from './dto/generate-campaign-title.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly mastra: MastraClient,
  ) {}

  async create(
    userId: string,
    projectId: string,
    dto: CreateCampaignDto,
  ): Promise<Campaign> {
    await this.projectsService.findOwnedOrFail(userId, projectId);

    const { startDate, endDate } = this.parseDateRange(
      dto.startDate,
      dto.endDate,
    );

    return this.prisma.campaign.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        objective: dto.objective,
        audience: dto.audience,
        tone: dto.tone,
        channels: dto.channels ?? [],
        startDate,
        endDate,
      },
    });
  }

  async findAll(userId: string, projectId: string, query: QueryCampaignsDto) {
    await this.projectsService.findOwnedOrFail(userId, projectId);

    const where: Prisma.CampaignWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { contents: true } } },
      }),
      this.prisma.campaign.count({ where }),
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
    await this.findOwnedOrFail(userId, id);

    return this.prisma.campaign.findUniqueOrThrow({
      where: { id },
      include: {
        contents: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * Generates a short sidebar title without overwriting a title the user set
   * while the model request was running.
   */
  async generateTitle(
    userId: string,
    id: string,
    dto: GenerateCampaignTitleDto,
  ): Promise<Campaign> {
    const campaign = await this.findOwnedOrFail(userId, id);
    if (!this.isUntitled(campaign.name)) return campaign;

    let title: string;
    try {
      const generated = await this.mastra.generateChatTitle(dto);
      title = this.validTitle(generated.title)
        ? generated.title.trim()
        : this.fallbackTitle(dto);
    } catch (error) {
      this.logger.warn(
        `Chat title generation failed for campaign ${id}; using fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      title = this.fallbackTitle(dto);
    }

    const updated = await this.prisma.campaign.updateMany({
      where: { id, name: campaign.name },
      data: { name: title },
    });

    // A manual rename may have won the race while the agent was thinking.
    if (updated.count === 0) return this.findOwnedOrFail(userId, id);
    return this.prisma.campaign.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Edits a draft in place. Published campaigns are rejected: editing one
   * would leave `publishedAt` pointing at a version of the campaign that no
   * longer exists, so anything reading that field for freshness would be
   * wrong. Going back through draft is the only way to change a live campaign.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOwnedOrFail(userId, id);

    if (campaign.status === CampaignStatus.PUBLISHED) {
      throw new ConflictException(
        'A published campaign cannot be edited in place. Save the changes ' +
          'with PUT /campaigns/:id/draft, or take it offline first with ' +
          'POST /campaigns/:id/unpublish.',
      );
    }

    return this.prisma.campaign.update({
      where: { id },
      data: this.buildUpdateData(campaign, dto),
    });
  }

  /**
   * Admin variant: edits a campaign regardless of project ownership. Reuses the
   * same field validation and date-range rules as {@link update}. Editing a
   * published campaign forces it back to DRAFT and clears `publishedAt`, so the
   * invariant that `publishedAt` always points at the exact published version
   * is preserved — the same rule the user-facing save-draft flow enforces. An
   * empty body is rejected because, on a published campaign, it would otherwise
   * un-publish with no actual edit.
   */
  async adminUpdate(id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findCampaignOrFail(id);

    if (campaign.status === CampaignStatus.PUBLISHED && !hasAnyValue(dto)) {
      throw new BadRequestException(
        'Provide at least one field to edit a published campaign, or use ' +
          'POST /admin/campaigns/:id/unpublish to take it offline.',
      );
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...this.buildUpdateData(campaign, dto),
        ...(campaign.status === CampaignStatus.PUBLISHED
          ? { status: CampaignStatus.DRAFT, publishedAt: null }
          : {}),
      },
    });
  }

  private async findCampaignOrFail(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  /**
   * Saves edits and moves the campaign back to draft. Used by the editor's
   * "Save draft" action, which must never leave a campaign published.
   *
   * Un-publishing here is a side effect of saving, so it needs something to
   * save: an empty body is rejected rather than quietly un-publishing a live
   * campaign. Use {@link unpublish} to change the status on its own.
   */
  async saveDraft(
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    if (!hasAnyValue(dto)) {
      throw new BadRequestException(
        'Provide at least one field to save. To only take the campaign ' +
          'offline, use POST /campaigns/:id/unpublish.',
      );
    }

    const campaign = await this.findOwnedOrFail(userId, id);

    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...this.buildUpdateData(campaign, dto),
        status: CampaignStatus.DRAFT,
        publishedAt: null,
      },
    });
  }

  async publish(userId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOwnedOrFail(userId, id);

    if (campaign.status === CampaignStatus.PUBLISHED) {
      throw new ConflictException('Campaign is already published');
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  /** Admin variant: publish a campaign regardless of project ownership. */
  async adminPublish(id: string): Promise<Campaign> {
    const campaign = await this.findCampaignOrFail(id);

    if (campaign.status === CampaignStatus.PUBLISHED) {
      throw new ConflictException('Campaign is already published');
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  /**
   * Takes a published campaign offline without touching its content. The
   * explicit counterpart to {@link publish}, so un-publishing is always
   * something the caller asked for by name.
   */
  async unpublish(userId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOwnedOrFail(userId, id);

    if (campaign.status === CampaignStatus.DRAFT) {
      throw new ConflictException('Campaign is not published');
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.DRAFT, publishedAt: null },
    });
  }

  /** Admin variant: unpublish a campaign regardless of project ownership. */
  async adminUnpublish(id: string): Promise<Campaign> {
    const campaign = await this.findCampaignOrFail(id);

    if (campaign.status === CampaignStatus.DRAFT) {
      throw new ConflictException('Campaign is not published');
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.DRAFT, publishedAt: null },
    });
  }

  /** Removes the campaign together with its generated content. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnedOrFail(userId, id);

    await this.prisma.campaign.delete({ where: { id } });
  }

  /**
   * Admin variant: deletes a campaign regardless of project ownership. The
   * schema cascade removes its strategies, content runs, and generated content
   * (and, through them, workflow executions and social publications), so no
   * orphan rows are left behind.
   */
  async adminRemove(
    id: string,
  ): Promise<{ id: string; name: string; deleted: boolean }> {
    const campaign = await this.findCampaignOrFail(id);

    await this.prisma.campaign.delete({ where: { id } });

    return { id, name: campaign.name, deleted: true };
  }

  /**
   * Shared ownership check: resolves the campaign only when its parent project
   * belongs to the given user, otherwise throws 404.
   */
  async findOwnedOrFail(userId: string, id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, project: { userId } },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  private buildUpdateData(
    campaign: Campaign,
    dto: UpdateCampaignDto,
  ): Prisma.CampaignUpdateInput {
    const { startDate, endDate } = this.parseDateRange(
      dto.startDate,
      dto.endDate,
      campaign,
    );

    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
      ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
      ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
      ...(dto.channels !== undefined ? { channels: dto.channels } : {}),
      ...(dto.startDate !== undefined ? { startDate } : {}),
      ...(dto.endDate !== undefined ? { endDate } : {}),
    };
  }

  private isUntitled(name: string): boolean {
    return /^(?:New chat|Campaign chat \d+)$/i.test(name.trim());
  }

  private validTitle(title: unknown): title is string {
    if (typeof title !== 'string') return false;
    const words = title.trim().split(/\s+/u).filter(Boolean);
    return words.length >= 4 && words.length <= 5 && title.length <= 120;
  }

  private fallbackTitle(dto: GenerateCampaignTitleDto): string {
    const fillerWords = new Set([
      'a',
      'an',
      'and',
      'at',
      'for',
      'from',
      'in',
      'of',
      'on',
      'the',
      'to',
      'with',
    ]);
    const candidates = `${dto.brandName} ${dto.product}`
      .replace(/[^\p{L}\p{N}'’-]+/gu, ' ')
      .trim()
      .split(/\s+/u)
      .filter((word) => word && !fillerWords.has(word.toLocaleLowerCase()));
    const words: string[] = [];

    for (const word of [
      ...candidates,
      'Campaign',
      'Launch',
      'Strategy',
      'Plan',
    ]) {
      if (
        !words.some(
          (item) => item.toLocaleLowerCase() === word.toLocaleLowerCase(),
        )
      ) {
        words.push(word);
      }
      if (words.length === 5) break;
    }

    return words.slice(0, 5).join(' ');
  }

  /**
   * Converts the incoming ISO dates and rejects ranges that end before they
   * start. Falls back to the stored dates so partial updates stay consistent.
   */
  private parseDateRange(
    rawStart: string | undefined,
    rawEnd: string | undefined,
    current?: Campaign,
  ): { startDate: Date | null; endDate: Date | null } {
    const startDate =
      rawStart !== undefined
        ? this.parseDate(rawStart, 'startDate')
        : (current?.startDate ?? null);
    const endDate =
      rawEnd !== undefined
        ? this.parseDate(rawEnd, 'endDate')
        : (current?.endDate ?? null);

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must not be before startDate');
    }

    return { startDate, endDate };
  }

  /**
   * Defence in depth behind `@IsDateString`. An unparseable string still gives
   * back a Date object, but its getTime() is NaN — and every comparison with
   * NaN is false, so the range check above would wave it through and Prisma
   * would be handed an Invalid Date. Reject it here instead.
   */
  private parseDate(raw: string, field: 'startDate' | 'endDate'): Date {
    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO 8601 date`);
    }

    return parsed;
  }
}
