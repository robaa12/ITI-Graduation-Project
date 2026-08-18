import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  CampaignStats,
  ContentStats,
  DashboardOverview,
  KnowledgeStats,
  ProjectStats,
  SocialStats,
  StrategyStats,
  SubscriptionStats,
  UserStats,
  WorkflowStats,
} from './types/dashboard.types';

/** Default window (days) used for windowed metrics when no range is given. */
const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the effective date window for windowed metrics.
   *
   * - Neither bound given: the last {@link DEFAULT_WINDOW_DAYS} days.
   * - Only `from` given: `to` is now.
   * - Only `to` given: `from` is 30 days before `to`.
   * - Both given: used as-is after validating `from <= to`.
   */
  private resolveRange(query: DashboardQueryDto): { from: Date; to: Date } {
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;

    let from: Date;
    let to: Date;

    if (query.from && query.to) {
      from = new Date(query.from);
      to = new Date(query.to);
    } else if (query.from) {
      from = new Date(query.from);
      to = now;
    } else if (query.to) {
      to = new Date(query.to);
      from = new Date(to.getTime() - DEFAULT_WINDOW_DAYS * msPerDay);
    } else {
      to = now;
      from = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * msPerDay);
    }

    if (from > to) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    return { from, to };
  }

  async getOverview(query: DashboardQueryDto): Promise<DashboardOverview> {
    const { from, to } = this.resolveRange(query);

    const [
      users,
      projects,
      subscriptions,
      workflows,
      content,
      knowledge,
      social,
      strategies,
      campaigns,
    ] = await Promise.all([
      this.getUserStats(from, to),
      this.getProjectStats(from, to),
      this.getSubscriptionStats(),
      this.getWorkflowStats(),
      this.getContentStats(),
      this.getKnowledgeStats(),
      this.getSocialStats(),
      this.getStrategyStats(),
      this.getCampaignStats(),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      users,
      projects,
      subscriptions,
      workflows,
      content,
      knowledge,
      social,
      strategies,
      campaigns,
    };
  }

  /**
   * User statistics. `new` counts registrations inside the window; every other
   * metric is an all-time count. The schema has no activity/last-seen column,
   * so "active users" cannot be derived and is intentionally not exposed.
   */
  private async getUserStats(from: Date, to: Date): Promise<UserStats> {
    const [total, newUsers, verified, unverified, roleGroups] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { createdAt: { gte: from, lte: to } },
        }),
        this.prisma.user.count({ where: { emailVerified: true } }),
        this.prisma.user.count({ where: { emailVerified: false } }),
        this.prisma.user.groupBy({
          by: ['role'],
          _count: { _all: true },
        }),
      ]);

    return {
      total,
      new: newUsers,
      verified,
      unverified,
      byRole: roleGroups.map((group) => ({
        role: group.role,
        count: group._count._all,
      })),
    };
  }

  /**
   * Project statistics. `recent` counts projects created inside the window;
   * `total` and `byStatus` are all-time.
   */
  private async getProjectStats(from: Date, to: Date): Promise<ProjectStats> {
    const [total, recent, statusGroups] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      recent,
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    };
  }

  /**
   * Subscription statistics. Active/canceled/paused are derived from a single
   * status groupBy; byPlan groups subscriptions by the attached plan. Revenue
   * is the sum of consumed plan-change quotes (actual money moved through the
   * app).
   */
  private async getSubscriptionStats(): Promise<SubscriptionStats> {
    const [total, statusGroups, planGroups, revenue] = await Promise.all([
      this.prisma.subscription.count(),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        _count: { _all: true },
      }),
      this.prisma.planChangeQuote.aggregate({
        where: { consumedAt: { not: null }, amountDueCents: { gt: 0 } },
        _sum: { amountDueCents: true },
        _count: { _all: true },
      }),
    ]);

    const byStatus = statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    }));
    const countFor = (status: string) =>
      byStatus.find((entry) => entry.status === status)?.count ?? 0;

    const planIds = planGroups
      .map((group) => group.planId)
      .filter((id): id is string => id !== null);
    const plans = planIds.length
      ? await this.prisma.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, code: true },
        })
      : [];
    const codeByPlanId = new Map(plans.map((plan) => [plan.id, plan.code]));

    return {
      total,
      active: countFor('ACTIVE'),
      canceled: countFor('CANCELLED'),
      paused: countFor('PAUSED'),
      byStatus,
      byPlan: planGroups.map((group) => ({
        planCode: group.planId
          ? (codeByPlanId.get(group.planId) ?? null)
          : null,
        count: group._count._all,
      })),
      planChangeRevenueCents: revenue._sum.amountDueCents ?? 0,
      chargedPlanChanges: revenue._count._all,
    };
  }

  /**
   * Workflow execution statistics (strategy, revision, and content runs).
   * successful = READY, failed = FAILED, pending = PENDING/RUNNING/SUSPENDED.
   */
  private async getWorkflowStats(): Promise<WorkflowStats> {
    const [total, statusGroups, kindGroups] = await Promise.all([
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.workflowExecution.groupBy({
        by: ['kind'],
        _count: { _all: true },
      }),
    ]);

    const byStatus = statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    }));

    const countFor = (status: string) =>
      byStatus.find((entry) => entry.status === status)?.count ?? 0;

    return {
      total,
      successful: countFor('READY'),
      failed: countFor('FAILED'),
      pending:
        countFor('PENDING') + countFor('RUNNING') + countFor('SUSPENDED'),
      byStatus,
      byKind: kindGroups.map((group) => ({
        kind: group.kind,
        count: group._count._all,
      })),
    };
  }

  /** Generated-content statistics, grouped by status. */
  private async getContentStats(): Promise<ContentStats> {
    const [total, statusGroups] = await Promise.all([
      this.prisma.generatedContent.count(),
      this.prisma.generatedContent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    };
  }

  /** Knowledge statistics: sources (by type/status) and crawled pages. */
  private async getKnowledgeStats(): Promise<KnowledgeStats> {
    const [total, pages, typeGroups, statusGroups] = await Promise.all([
      this.prisma.knowledgeSource.count(),
      this.prisma.knowledgePage.count(),
      this.prisma.knowledgeSource.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.prisma.knowledgeSource.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      pages,
      byType: typeGroups.map((group) => ({
        type: group.type,
        count: group._count._all,
      })),
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    };
  }

  /**
   * Social statistics: publications with a status breakdown, provider
   * connections, and connected accounts grouped by platform.
   */
  private async getSocialStats(): Promise<SocialStats> {
    const [
      publications,
      publicationStatusGroups,
      connections,
      accounts,
      accountPlatformGroups,
    ] = await Promise.all([
      this.prisma.socialPublication.count(),
      this.prisma.socialPublication.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.socialConnection.count(),
      this.prisma.socialAccount.count(),
      this.prisma.socialAccount.groupBy({
        by: ['platform'],
        _count: { _all: true },
      }),
    ]);

    return {
      publications,
      publicationsByStatus: publicationStatusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      connections,
      accounts,
      accountsByPlatform: accountPlatformGroups.map((group) => ({
        platform: group.platform,
        count: group._count._all,
      })),
    };
  }

  /** Strategy statistics: workflow status and human approval status. */
  private async getStrategyStats(): Promise<StrategyStats> {
    const [total, statusGroups, approvalGroups] = await Promise.all([
      this.prisma.marketingStrategy.count(),
      this.prisma.marketingStrategy.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.marketingStrategy.groupBy({
        by: ['approvalStatus'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      byApprovalStatus: approvalGroups.map((group) => ({
        approvalStatus: group.approvalStatus,
        count: group._count._all,
      })),
    };
  }

  /** Campaign statistics: total and DRAFT/PUBLISHED status breakdown. */
  private async getCampaignStats(): Promise<CampaignStats> {
    const [total, statusGroups] = await Promise.all([
      this.prisma.campaign.count(),
      this.prisma.campaign.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    };
  }
}
