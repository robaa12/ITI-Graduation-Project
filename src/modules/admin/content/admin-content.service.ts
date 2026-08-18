import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AdminContentQueryDto } from './dto/admin-content-query.dto';
import type {
  AdminContentDetail,
  AdminContentListItem,
} from './types/admin-content.types';

@Injectable()
export class AdminContentService {
  constructor(private readonly prisma: PrismaService) {}

  async listContents(query: AdminContentQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      status,
      format,
      type,
      campaignId,
      projectId,
      userId,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.GeneratedContentWhereInput = {};
    if (status) where.status = status;
    if (format) where.format = format;
    if (type) where.type = { contains: type, mode: 'insensitive' };
    const campaignFilters: Prisma.GeneratedContentWhereInput[] = [];
    if (campaignId) campaignFilters.push({ campaignId });
    if (projectId) campaignFilters.push({ campaign: { projectId } });
    if (userId) campaignFilters.push({ campaign: { project: { userId } } });
    if (campaignFilters.length > 0) where.AND = campaignFilters;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.GeneratedContentOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.generatedContent.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.contentSelect,
          ...this.contentRefsSelect,
        },
      }),
      this.prisma.generatedContent.count({ where }),
    ]);

    return {
      data: items.map((item): AdminContentListItem =>
        this.presentListItem(item),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  protected contentSelect = {
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
  } satisfies Prisma.GeneratedContentSelect;

  protected contentRefsSelect = {
    campaign: {
      select: {
        id: true,
        name: true,
        project: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    },
  } satisfies Prisma.GeneratedContentSelect;

  protected presentListItem(content: {
    id: string;
    type: string;
    title: string | null;
    format: Prisma.GeneratedContentGetPayload<object>['format'];
    status: Prisma.GeneratedContentGetPayload<object>['status'];
    version: number;
    isEdited: boolean;
    error: string | null;
    contentRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
    campaign: {
      id: string;
      name: string;
      project: {
        id: string;
        name: string;
        user: { id: string; name: string; email: string };
      };
    } | null;
  }): AdminContentListItem {
    return {
      id: content.id,
      type: content.type,
      title: content.title,
      format: content.format,
      status: content.status,
      version: content.version,
      isEdited: content.isEdited,
      error: content.error,
      contentRunId: content.contentRunId,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      campaign: content.campaign
        ? { id: content.campaign.id, name: content.campaign.name }
        : null,
      project: content.campaign?.project
        ? {
            id: content.campaign.project.id,
            name: content.campaign.project.name,
          }
        : null,
      user: content.campaign?.project?.user ?? null,
    };
  }

  async getContent(id: string): Promise<AdminContentDetail> {
    const content = await this.prisma.generatedContent.findUnique({
      where: { id },
      select: {
        ...this.contentSelect,
        ...this.contentRefsSelect,
        body: true,
        payload: true,
        prompt: true,
        model: true,
      },
    });

    if (!content) {
      throw new NotFoundException(`Generated content with ID ${id} not found`);
    }

    const { body, payload, prompt, model, ...rest } = content;
    return {
      ...this.presentListItem(rest),
      body,
      payload,
      prompt,
      model,
    };
  }
}
