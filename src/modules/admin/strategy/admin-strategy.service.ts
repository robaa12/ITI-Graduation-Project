import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AdminStrategyQueryDto } from './dto/admin-strategy-query.dto';
import type {
  AdminStrategyDetail,
  AdminStrategyListItem,
  AdminStrategyReviewEvent,
} from './types/admin-strategy.types';

@Injectable()
export class AdminStrategyService {
  constructor(private readonly prisma: PrismaService) {}

  async listStrategies(query: AdminStrategyQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      status,
      approvalStatus,
      campaignId,
      projectId,
      userId,
      search,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.MarketingStrategyWhereInput = {};
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    const campaignFilters: Prisma.MarketingStrategyWhereInput[] = [];
    if (campaignId) campaignFilters.push({ campaignId });
    if (projectId) campaignFilters.push({ campaign: { projectId } });
    if (userId) campaignFilters.push({ campaign: { project: { userId } } });
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      campaignFilters.push({
        campaign: { name: { contains: normalizedSearch, mode: 'insensitive' } },
      });
    }
    if (campaignFilters.length > 0) where.AND = campaignFilters;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.MarketingStrategyOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.marketingStrategy.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.strategySelect,
          ...this.strategyRefsSelect,
        },
      }),
      this.prisma.marketingStrategy.count({ where }),
    ]);

    return {
      data: items.map((item): AdminStrategyListItem =>
        this.presentListItem(item),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  protected strategySelect = {
    id: true,
    runId: true,
    status: true,
    approvalStatus: true,
    error: true,
    reviewedAt: true,
    reviewerName: true,
    reviewNote: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.MarketingStrategySelect;

  protected strategyRefsSelect = {
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
    _count: { select: { executions: true, reviewEvents: true } },
  } satisfies Prisma.MarketingStrategySelect;

  protected presentListItem(strategy: {
    id: string;
    runId: string | null;
    status: Prisma.MarketingStrategyGetPayload<object>['status'];
    approvalStatus: Prisma.MarketingStrategyGetPayload<object>['approvalStatus'];
    error: string | null;
    reviewedAt: Date | null;
    reviewerName: string | null;
    reviewNote: string | null;
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
    _count: { executions: number; reviewEvents: number };
  }): AdminStrategyListItem {
    return {
      id: strategy.id,
      runId: strategy.runId,
      status: strategy.status,
      approvalStatus: strategy.approvalStatus,
      error: strategy.error,
      reviewedAt: strategy.reviewedAt,
      reviewerName: strategy.reviewerName,
      reviewNote: strategy.reviewNote,
      createdAt: strategy.createdAt,
      updatedAt: strategy.updatedAt,
      campaign: strategy.campaign
        ? { id: strategy.campaign.id, name: strategy.campaign.name }
        : null,
      project: strategy.campaign?.project
        ? {
            id: strategy.campaign.project.id,
            name: strategy.campaign.project.name,
          }
        : null,
      user: strategy.campaign?.project?.user ?? null,
      executionCount: strategy._count.executions,
    };
  }

  async getStrategy(id: string): Promise<AdminStrategyDetail> {
    const strategy = await this.prisma.marketingStrategy.findUnique({
      where: { id },
      select: {
        ...this.strategySelect,
        ...this.strategyRefsSelect,
        input: true,
        output: true,
        suspendPayload: true,
        pendingRevision: true,
      },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy with ID ${id} not found`);
    }

    const { _count, ...rest } = strategy;
    return {
      ...this.presentListItem({ ...rest, _count }),
      input: strategy.input,
      output: strategy.output,
      suspendPayload: strategy.suspendPayload,
      pendingRevision: strategy.pendingRevision,
      reviewEventCount: _count.reviewEvents,
    };
  }

  async listStrategyReviews(id: string) {
    const strategy = await this.prisma.marketingStrategy.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!strategy) {
      throw new NotFoundException(`Strategy with ID ${id} not found`);
    }

    const events = await this.prisma.strategyReviewEvent.findMany({
      where: { strategyId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        note: true,
        reviewerId: true,
        reviewerName: true,
        createdAt: true,
      },
    });

    return {
      data: events.map((event): AdminStrategyReviewEvent => ({ ...event })),
      meta: { total: events.length },
    };
  }
}
