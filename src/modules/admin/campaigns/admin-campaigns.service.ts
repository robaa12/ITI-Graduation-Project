import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { AdminCampaignsQueryDto } from './dto/admin-campaigns-query.dto';
import { AdminUpdateCampaignDto } from './dto/admin-update-campaign.dto';
import { AdminCampaignContentsQueryDto } from './dto/admin-campaign-contents-query.dto';
import { AdminCampaignPublicationsQueryDto } from './dto/admin-campaign-publications-query.dto';
import { AdminCampaignStrategiesQueryDto } from './dto/admin-campaign-strategies-query.dto';
import { AdminCampaignContentRunsQueryDto } from './dto/admin-campaign-content-runs-query.dto';
import type {
  AdminCampaignContentListItem,
  AdminCampaignContentRunListItem,
  AdminCampaignDetail,
  AdminCampaignListItem,
  AdminCampaignPublicationListItem,
  AdminCampaignStrategyListItem,
} from './types/admin-campaigns.types';

@Injectable()
export class AdminCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  async listCampaigns(query: AdminCampaignsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      search,
      status,
      projectId,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.CampaignWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { description: { contains: normalizedSearch, mode: 'insensitive' } },
        { objective: { contains: normalizedSearch, mode: 'insensitive' } },
        {
          project: {
            name: { contains: normalizedSearch, mode: 'insensitive' },
          },
        },
      ];
    }
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.CampaignOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true } },
          _count: {
            select: { contents: true, strategies: true, contentRuns: true },
          },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: items.map(
        ({ project, _count, ...campaign }): AdminCampaignListItem => ({
          ...campaign,
          project,
          contentCount: _count.contents,
          strategyCount: _count.strategies,
          contentRunCount: _count.contentRuns,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCampaign(id: string): Promise<AdminCampaignDetail> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        objective: true,
        audience: true,
        tone: true,
        channels: true,
        status: true,
        startDate: true,
        endDate: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: { contents: true, strategies: true, contentRuns: true },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    const { project, _count, ...rest } = campaign;

    const [publications, workflowExecutions] = await Promise.all([
      this.prisma.socialPublication.count({
        where: { content: { campaignId: id } },
      }),
      this.prisma.workflowExecution.count({
        where: {
          OR: [
            { strategy: { campaignId: id } },
            { contentRun: { campaignId: id } },
          ],
        },
      }),
    ]);

    return {
      ...rest,
      project: {
        id: project.id,
        name: project.name,
        owner: project.user,
      },
      summary: {
        contents: _count.contents,
        strategies: _count.strategies,
        contentRuns: _count.contentRuns,
        publications,
        workflowExecutions,
      },
    };
  }

  async updateCampaign(id: string, dto: AdminUpdateCampaignDto) {
    return this.campaigns.adminUpdate(id, dto);
  }

  async deleteCampaign(id: string) {
    return this.campaigns.adminRemove(id);
  }

  async publishCampaign(id: string) {
    return this.campaigns.adminPublish(id);
  }

  async unpublishCampaign(id: string) {
    return this.campaigns.adminUnpublish(id);
  }

  async listCampaignContents(id: string, query: AdminCampaignContentsQueryDto) {
    await this.findCampaignOrFail(id);

    const { page = 1, limit = 20, status, format, type } = query;

    const where: Prisma.GeneratedContentWhereInput = { campaignId: id };
    if (status) where.status = status;
    if (format) where.format = format;
    if (type) where.type = { contains: type, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.generatedContent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          format: true,
          status: true,
          version: true,
          isEdited: true,
          error: true,
          contentRunId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.generatedContent.count({ where }),
    ]);

    return {
      data: items.map((item): AdminCampaignContentListItem => ({ ...item })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listCampaignPublications(
    id: string,
    query: AdminCampaignPublicationsQueryDto,
  ) {
    await this.findCampaignOrFail(id);

    const { page = 1, limit = 20, status, platform } = query;

    const where: Prisma.SocialPublicationWhereInput = {
      content: { campaignId: id },
    };
    if (status) where.status = status;
    if (platform) where.platform = platform;

    const [items, total] = await Promise.all([
      this.prisma.socialPublication.findMany({
        where,
        orderBy: { scheduledFor: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          platform: true,
          accountName: true,
          caption: true,
          scheduledFor: true,
          publishedAt: true,
          externalPostId: true,
          error: true,
          revision: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.socialPublication.count({ where }),
    ]);

    return {
      data: items.map((item): AdminCampaignPublicationListItem => ({
        ...item,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listCampaignStrategies(
    id: string,
    query: AdminCampaignStrategiesQueryDto,
  ) {
    await this.findCampaignOrFail(id);

    const { page = 1, limit = 20, status, approvalStatus } = query;

    const where: Prisma.MarketingStrategyWhereInput = { campaignId: id };
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;

    const [items, total] = await Promise.all([
      this.prisma.marketingStrategy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          runId: true,
          status: true,
          approvalStatus: true,
          error: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { executions: true } },
        },
      }),
      this.prisma.marketingStrategy.count({ where }),
    ]);

    return {
      data: items.map(
        ({ _count, ...strategy }): AdminCampaignStrategyListItem => ({
          ...strategy,
          executionCount: _count.executions,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listCampaignContentRuns(
    id: string,
    query: AdminCampaignContentRunsQueryDto,
  ) {
    await this.findCampaignOrFail(id);

    const { page = 1, limit = 20, status } = query;

    const where: Prisma.CampaignContentRunWhereInput = { campaignId: id };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.campaignContentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          runId: true,
          status: true,
          contentCount: true,
          error: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { executions: true } },
        },
      }),
      this.prisma.campaignContentRun.count({ where }),
    ]);

    return {
      data: items.map(
        ({ _count, ...run }): AdminCampaignContentRunListItem => ({
          ...run,
          executionCount: _count.executions,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async findCampaignOrFail(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }
}
