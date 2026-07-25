import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Campaign, CampaignStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
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

  async update(
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOwnedOrFail(userId, id);

    return this.prisma.campaign.update({
      where: { id },
      data: this.buildUpdateData(campaign, dto),
    });
  }

  /**
   * Saves edits and moves the campaign back to draft. Used by the editor's
   * "Save draft" action, which must never leave a campaign published.
   */
  async saveDraft(
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
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

  /** Removes the campaign together with its generated content. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnedOrFail(userId, id);

    await this.prisma.campaign.delete({ where: { id } });
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
        ? new Date(rawStart)
        : (current?.startDate ?? null);
    const endDate =
      rawEnd !== undefined ? new Date(rawEnd) : (current?.endDate ?? null);

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must not be before startDate');
    }

    return { startDate, endDate };
  }
}
