import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  SubscriptionStatus,
  UserRole,
  WorkflowAccountingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowAccountingService } from '../workflow-accounting/workflow-accounting.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminSubscriptionsQueryDto } from './dto/admin-subscriptions-query.dto';
import { AdminPublicationsQueryDto } from './dto/admin-publications-query.dto';

const FREE_FALLBACK_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.INCOMPLETE,
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.CANCELLED,
];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: WorkflowAccountingService,
  ) {}

  async getAdminUsers(query: AdminUsersQueryDto) {
    const { page = 1, limit = 20, search, role, sortBy, sortOrder } = query;

    const where: Prisma.UserWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { email: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy) {
      orderBy = { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminUserStatistics() {
    const [totalUsers, roleGroups] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    const byRole: Record<string, number> = {};
    for (const group of roleGroups) {
      byRole[group.role] = group._count._all;
    }

    return { totalUsers, byRole };
  }

  async getAdminUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async getAdminUserAnalytics(id: string) {
    const [user, projects, executions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          generationCreditsUsed: true,
          generationCreditLimit: true,
          subscription: {
            select: {
              id: true,
              status: true,
              billingInterval: true,
              currentPeriodStart: true,
              currentPeriodEnd: true,
              plan: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  generationCredits: true,
                  priceMonthlyCents: true,
                  priceYearlyCents: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.project.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { campaigns: true } },
        },
      }),
      this.prisma.workflowExecution.findMany({
        where: {
          OR: [
            { strategy: { campaign: { project: { userId: id } } } },
            { contentRun: { campaign: { project: { userId: id } } } },
          ],
        },
        include: {
          strategy: {
            select: { campaign: { select: { projectId: true } } },
          },
          contentRun: {
            select: { campaign: { select: { projectId: true } } },
          },
        },
      }),
    ]);

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    // User analytics is often the first place an administrator inspects an
    // older execution. Reuse the bounded read-repair used by workflow detail
    // so terminal PENDING/UNAVAILABLE records can recover usage that arrived
    // late in Mastra observability.
    const reconciled = await this.accounting.reconcileForPresentation(
      executions,
    );
    const reconciledById = new Map(
      reconciled.map((execution) => [execution.id, execution]),
    );
    const executionRows = executions.map((execution) => ({
      ...execution,
      ...reconciledById.get(execution.id),
    }));

    const projectUsage = new Map(
      projects.map((project) => [
        project.id,
        {
          ...project,
          campaignCount: project._count.campaigns,
          executionCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          pricedExecutions: 0,
          recordedUsageExecutions: 0,
          missingAccountingExecutions: 0,
          lastExecutionAt: null as Date | null,
        },
      ]),
    );

    for (const execution of executionRows) {
      const projectId =
        execution.strategy?.campaign.projectId ??
        execution.contentRun?.campaign.projectId;
      if (!projectId) continue;
      const usage = projectUsage.get(projectId);
      if (!usage) continue;

      usage.executionCount += 1;
      usage.inputTokens += execution.inputTokens;
      usage.outputTokens += execution.outputTokens;
      usage.totalTokens += execution.totalTokens;
      if (execution.usageCollectedAt) {
        usage.recordedUsageExecutions += 1;
      }
      if (!usage.lastExecutionAt || execution.createdAt > usage.lastExecutionAt) {
        usage.lastExecutionAt = execution.createdAt;
      }

      if (
        execution.accountingStatus === WorkflowAccountingStatus.READY &&
        execution.costUnit === 'USD' &&
        execution.estimatedCost != null
      ) {
        usage.pricedExecutions += 1;
        usage.estimatedCostUsd += Number(execution.estimatedCost);
      }
      if (
        execution.accountingStatus === WorkflowAccountingStatus.PENDING ||
        execution.accountingStatus === WorkflowAccountingStatus.UNAVAILABLE
      ) {
        usage.missingAccountingExecutions += 1;
      }
    }

    const projectRows = [...projectUsage.values()]
      .map(({ _count: _count, ...project }) => ({
        ...project,
        estimatedCostUsd: Number(project.estimatedCostUsd.toFixed(10)),
      }))
      .sort((left, right) => {
        // Put useful rows first so a customer with many empty or historical
        // projects sees their recorded token/cost data immediately.
        if (right.totalTokens !== left.totalTokens) {
          return right.totalTokens - left.totalTokens;
        }
        if (right.executionCount !== left.executionCount) {
          return right.executionCount - left.executionCount;
        }
        return (
          (right.lastExecutionAt?.getTime() ?? 0) -
          (left.lastExecutionAt?.getTime() ?? 0)
        );
      });
    const totals = projectRows.reduce(
      (summary, project) => ({
        projectCount: summary.projectCount + 1,
        campaignCount: summary.campaignCount + project.campaignCount,
        executionCount: summary.executionCount + project.executionCount,
        inputTokens: summary.inputTokens + project.inputTokens,
        outputTokens: summary.outputTokens + project.outputTokens,
        totalTokens: summary.totalTokens + project.totalTokens,
        estimatedCostUsd:
          summary.estimatedCostUsd + project.estimatedCostUsd,
        pricedExecutions:
          summary.pricedExecutions + project.pricedExecutions,
        recordedUsageExecutions:
          summary.recordedUsageExecutions + project.recordedUsageExecutions,
        missingAccountingExecutions:
          summary.missingAccountingExecutions +
          project.missingAccountingExecutions,
      }),
      {
        projectCount: 0,
        campaignCount: 0,
        executionCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        pricedExecutions: 0,
        recordedUsageExecutions: 0,
        missingAccountingExecutions: 0,
      },
    );
    totals.estimatedCostUsd = Number(totals.estimatedCostUsd.toFixed(10));

    return { user, totals, projects: projectRows };
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.image !== undefined) data.image = dto.image;

    return this.prisma.user.update({ where: { id }, data });
  }

  async updateUserRole(id: string, role: string) {
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException(
        `Invalid role: ${role}. Must be one of ${Object.values(UserRole).join(', ')}`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return this.prisma.user.update({
      where: { id },
      data: { role: role as UserRole },
    });
  }

  async deleteUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    if (actorId === id) {
      throw new BadRequestException('Admins cannot delete their own account');
    }

    const [projectCount, connectionCount, subscriptionCount, creditEventCount] =
      await Promise.all([
        this.prisma.project.count({ where: { userId: id } }),
        this.prisma.socialConnection.count({ where: { userId: id } }),
        this.prisma.subscription.count({ where: { userId: id } }),
        this.prisma.generationCreditEvent.count({ where: { userId: id } }),
      ]);

    if (
      projectCount > 0 ||
      connectionCount > 0 ||
      subscriptionCount > 0 ||
      creditEventCount > 0
    ) {
      throw new ConflictException(
        `Cannot delete user "${user.email}": the account still owns related business records ` +
          `(${projectCount} project(s), ${connectionCount} social connection(s), ` +
          `${subscriptionCount} subscription(s), ${creditEventCount} credit event(s)). ` +
          'Archive or transfer them before deleting the user.',
      );
    }

    await this.prisma.user.delete({ where: { id } });

    return {
      id,
      name: user.name,
      email: user.email,
      role: user.role,
      deleted: true,
    };
  }

  async getAdminGeneratedContent(page: number, limit: number, status?: string, format?: string, campaignId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (format) where.format = format;
    if (campaignId) where.campaignId = campaignId;
    const items = await this.prisma.generatedContent.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.generatedContent.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminGeneratedContentById(id: string) {
    const content = await this.prisma.generatedContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException(`Generated content with ID ${id} not found`);
    return content;
  }

  async getAdminKnowledgeSources(page: number, limit: number, search?: string, type?: string, status?: string, projectId?: string) {
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (type) where.type = type;
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    const items = await this.prisma.knowledgeSource.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.knowledgeSource.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminKnowledgeSourceById(id: string) {
    const source = await this.prisma.knowledgeSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException(`Knowledge source with ID ${id} not found`);
    return source;
  }

  async getAdminSocialConnections(page: number, limit: number, provider?: string, status?: string, userId?: string) {
    const where: any = {};
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (userId) where.userId = userId;
    const items = await this.prisma.socialConnection.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.socialConnection.count({ where });
    const maskedItems = items.map((connection: any) => ({
      ...connection,
      accessTokenCiphertext: '******** masked ********',
    }));
    return { items: maskedItems, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminSocialConnectionById(id: string) {
    const connection = await this.prisma.socialConnection.findUnique({ where: { id }, include: { accounts: true } });
    if (!connection) throw new NotFoundException(`Social connection with ID ${id} not found`);
    const { accessTokenCiphertext: _connectionToken, ...safeConnection } = connection;
    return {
      ...safeConnection,
      accessTokenCiphertext: '******** masked ********',
      accounts: connection.accounts.map(({ accessTokenCiphertext: _accountToken, ...account }: any) => ({
        ...account,
        accessTokenCiphertext: '******** masked ********',
      })),
    };
  }

  async getAdminSocialAccounts(page: number, limit: number, platform?: string, available?: boolean, selected?: boolean, userId?: string) {
    const where: any = {};
    if (platform) where.platform = platform;
    if (available !== undefined) where.available = available;
    if (selected !== undefined) where.selected = selected;
    if (userId) where.connection = { userId };
    const items = await this.prisma.socialAccount.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.socialAccount.count({ where });
    const maskedItems = items.map((account: any) => ({
      ...account,
      accessTokenCiphertext: '******** masked ********',
    }));
    return { items: maskedItems, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminSocialAccountById(id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id }, include: { connection: true } });
    if (!account) throw new NotFoundException(`Social account with ID ${id} not found`);
    const { accessTokenCiphertext: _accountToken, connection, ...safeAccount } = account;
    const result: any = { ...safeAccount, accessTokenCiphertext: '******** masked ********', metadata: {} };
    if (account.connection) {
      const { accessTokenCiphertext: _connectionToken, ...safeConnection } = connection;
      result.connection = safeConnection;
      result.metadata = { platform: account.connection.provider, status: account.connection.status };
    }
    return result;
  }

  async getAdminPublications(query: AdminPublicationsQueryDto) {
    const { page = 1, limit = 20, status, platform, search, sortBy, sortOrder } = query;

    const where: Prisma.SocialPublicationWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { accountName: { contains: normalizedSearch, mode: 'insensitive' } },
        { content: { title: { contains: normalizedSearch, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (platform) where.platform = platform;

    let orderBy: Prisma.SocialPublicationOrderByWithRelationInput = {
      createdAt: 'desc',
    };
    if (sortBy) {
      orderBy = { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.socialPublication.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          scheduledFor: true,
          platform: true,
          accountName: true,
          externalAccountId: true,
          publishedAt: true,
          externalPostId: true,
          error: true,
          revision: true,
          createdAt: true,
          updatedAt: true,
          contentId: true,
          socialAccountId: true,
          content: {
            select: {
              id: true,
              title: true,
              type: true,
              campaign: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.socialPublication.count({ where }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminPublicationById(id: string) {
    const publication = await this.prisma.socialPublication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        caption: true,
        mediaUrl: true,
        platform: true,
        accountName: true,
        externalAccountId: true,
        publishedAt: true,
        externalPostId: true,
        error: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
        contentId: true,
        socialAccountId: true,
        content: {
          select: {
            id: true,
            title: true,
            type: true,
            body: true,
            campaign: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    if (!publication) {
      throw new NotFoundException(`Social publication with ID ${id} not found`);
    }
    return publication;
  }

  // ===== Step 3: Subscription / Plan Management =====

  async getAdminPlans(page: number, limit: number, active?: boolean) {
    const where: any = {};
    if (active !== undefined) where.active = active;
    const items = await this.prisma.plan.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.plan.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminPlanById(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    return plan;
  }

  async getAdminSubscriptions(query: AdminSubscriptionsQueryDto) {
    const { page = 1, limit = 20, status, search, sortBy, sortOrder } = query;

    const where: Prisma.SubscriptionWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.user = {
        OR: [
          { name: { contains: normalizedSearch, mode: 'insensitive' } },
          { email: { contains: normalizedSearch, mode: 'insensitive' } },
        ],
      };
    }
    if (status) where.status = status;

    let orderBy: Prisma.SubscriptionOrderByWithRelationInput = {
      createdAt: 'desc',
    };
    if (sortBy) {
      orderBy = { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          status: true,
          planId: true,
          billingInterval: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          pendingPlanId: true,
          pendingInterval: true,
          pendingEffectiveAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          plan: {
            select: { id: true, code: true, name: true },
          },
          pendingPlan: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminSubscriptionById(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        planId: true,
        billingInterval: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        pendingPlanId: true,
        pendingInterval: true,
        pendingEffectiveAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            priceMonthlyCents: true,
            priceYearlyCents: true,
            generationCredits: true,
          },
        },
        pendingPlan: {
          select: { id: true, code: true, name: true },
        },
      },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  // ===== Step 3: Revenue Analytics =====

  async getAdminRevenueOverview(page: number, limit: number) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [allTime, monthly, yearly] = await Promise.all([
      this.prisma.planChangeQuote.aggregate({
        where: { consumedAt: { not: null }, amountDueCents: { gt: 0 } },
        _sum: { amountDueCents: true },
        _count: { _all: true },
      }),
      this.prisma.planChangeQuote.aggregate({
        where: {
          consumedAt: { not: null },
          amountDueCents: { gt: 0 },
          createdAt: { gte: monthStart },
        },
        _sum: { amountDueCents: true },
      }),
      this.prisma.planChangeQuote.aggregate({
        where: {
          consumedAt: { not: null },
          amountDueCents: { gt: 0 },
          createdAt: { gte: yearStart },
        },
        _sum: { amountDueCents: true },
      }),
    ]);
    const totalRevenue = allTime._sum.amountDueCents ?? 0;
    const successfulPayments = allTime._count._all;

    return {
      totalRevenue,
      monthlyRevenue: monthly._sum.amountDueCents ?? 0,
      yearlyRevenue: yearly._sum.amountDueCents ?? 0,
      successfulPayments,
      averagePayment: successfulPayments ? totalRevenue / successfulPayments : 0,
      meta: { page: pageNum, limit: limitNum },
    };
  }

  async getAdminRevenuePerUser(page: number, limit: number, userId?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const userWhere: Prisma.UserWhereInput = {
      role: UserRole.USER,
      ...(userId ? { id: userId } : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: (pageNum - 1) * limitNum,
        select: {
          id: true,
          name: true,
          email: true,
          subscription: {
            select: {
              status: true,
              plan: {
                select: { code: true, name: true, active: true },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    const groups = users.length
      ? await this.prisma.planChangeQuote.groupBy({
          by: ['userId'],
          where: {
            userId: { in: users.map((user) => user.id) },
            consumedAt: { not: null },
            amountDueCents: { gt: 0 },
          },
          _sum: { amountDueCents: true },
          _count: { _all: true },
          _max: { consumedAt: true },
        })
      : [];
    const paymentsByUserId = new Map(
      groups.map((group) => [group.userId, group]),
    );
    const userList = users.map(({ subscription, ...user }) => {
      const usesFreeFallback =
        !subscription?.plan?.active ||
        FREE_FALLBACK_SUBSCRIPTION_STATUSES.includes(subscription.status);
      const payments = paymentsByUserId.get(user.id);

      return {
        userId: user.id,
        user,
        planCode: usesFreeFallback
          ? 'free'
          : (subscription?.plan?.code ?? 'free'),
        planName: usesFreeFallback
          ? 'Free'
          : (subscription?.plan?.name ?? 'Free'),
        subscriptionStatus: usesFreeFallback
          ? 'FREE'
          : (subscription?.status ?? 'FREE'),
        totalPaid: payments?._sum.amountDueCents ?? 0,
        paymentCount: payments?._count._all ?? 0,
        latestPayment: payments?._max.consumedAt ?? null,
      };
    });

    return {
      data: userList,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    };
  }

  async getAdminRevenuePerPlan(page: number, limit: number, planId?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where = planId ? { id: planId } : {};
    const plans = await this.prisma.plan.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        priceMonthlyCents: true,
        priceYearlyCents: true,
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          select: { billingInterval: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
      take: limitNum,
      skip: (pageNum - 1) * limitNum,
    });
    const total = await this.prisma.plan.count({ where });
    const includesFreePlan = plans.some((plan) => plan.code === 'free');
    const [paidPlanChangeGroups, implicitFreeSubscriberCount] =
      await Promise.all([
        this.prisma.planChangeQuote.groupBy({
          by: ['planId'],
          where: {
            planId: { in: plans.map((plan) => plan.id) },
            consumedAt: { not: null },
            amountDueCents: { gt: 0 },
          },
          _sum: { amountDueCents: true },
          _count: { _all: true },
        }),
        includesFreePlan
          ? this.prisma.user.count({
              where: {
                role: UserRole.USER,
                OR: [
                  { subscription: { is: null } },
                  { subscription: { is: { plan: { is: null } } } },
                  {
                    subscription: {
                      is: { plan: { is: { active: false } } },
                    },
                  },
                  {
                    subscription: {
                      is: {
                        status: {
                          in: FREE_FALLBACK_SUBSCRIPTION_STATUSES,
                        },
                      },
                    },
                  },
                ],
              },
            })
          : Promise.resolve(0),
      ]);
    const paidChangesByPlanId = new Map(
      paidPlanChangeGroups.map((group) => [group.planId, group]),
    );
    const planList = plans.map((plan) => {
      let monthlySubscribers = 0;
      let yearlySubscribers = 0;
      let monthlyRecurringRevenueCents = 0;

      for (const subscription of plan.subscriptions) {
        if (subscription.billingInterval === 'YEARLY') {
          yearlySubscribers += 1;
          monthlyRecurringRevenueCents += (plan.priceYearlyCents ?? 0) / 12;
        } else {
          monthlySubscribers += 1;
          monthlyRecurringRevenueCents += plan.priceMonthlyCents ?? 0;
        }
      }

      const paidChanges = paidChangesByPlanId.get(plan.id);

      return {
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        subscriberCount:
          plan.subscriptions.length +
          (plan.code === 'free' ? implicitFreeSubscriberCount : 0),
        monthlySubscribers,
        yearlySubscribers,
        monthlyRecurringRevenueCents: Math.round(monthlyRecurringRevenueCents),
        planChangeRevenueCents: paidChanges?._sum.amountDueCents ?? 0,
        chargedPlanChanges: paidChanges?._count._all ?? 0,
      };
    });

    return {
      data: planList,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    };
  }

  // ===== Step 3: Generation Credit Events =====

  async getAdminCreditEvents(page: number, limit: number, userId?: string, kind?: string, refunded?: boolean, startDate?: string, endDate?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where: any = {};
    if (userId) where.userId = userId;
    if (kind) where.kind = kind;
    if (refunded !== undefined) {
      if (refunded) where.refundedAt = { not: null };
      else where.refundedAt = null;
    }
    if (startDate || endDate) {
      where.periodStart = {};
      if (startDate) where.periodStart.gte = new Date(startDate);
      if (endDate) where.periodStart.lte = new Date(endDate);
    }

    const items = await this.prisma.generationCreditEvent.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum });
    const total = await this.prisma.generationCreditEvent.count({ where });

    return { items, meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
  }

  async getAdminUserCreditEvents(page: number, limit: number, userId: string, kind?: string, refunded?: boolean, startDate?: string, endDate?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where: any = { userId };
    if (kind) where.kind = kind;
    if (refunded !== undefined) {
      if (refunded) where.refundedAt = { not: null };
      else where.refundedAt = null;
    }
    if (startDate || endDate) {
      where.periodStart = {};
      if (startDate) where.periodStart.gte = new Date(startDate);
      if (endDate) where.periodStart.lte = new Date(endDate);
    }

    const items = await this.prisma.generationCreditEvent.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum });
    const total = await this.prisma.generationCreditEvent.count({ where });

    return { items, meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
  }

  // ===== Step 3: Workflow Executions =====

  async getAdminWorkflowExecutions(page: number, limit: number, userId?: string, kind?: string, status?: string, accountingStatus?: string, startDate?: string, endDate?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where: any = {};
    if (userId) {
      where.OR = [
        { strategy: { campaign: { project: { userId } } } },
        { contentRun: { campaign: { project: { userId } } } },
      ];
    }
    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (accountingStatus) where.accountingStatus = accountingStatus;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const items = await this.prisma.workflowExecution.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum });
    const total = await this.prisma.workflowExecution.count({ where });

    const sanitizedItems = items.map(item => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      accountingStatus: item.accountingStatus,
      estimatedCost: item.estimatedCost,
      createdAt: item.createdAt,
    }));

    return { items: sanitizedItems, meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
  }

  async getAdminWorkflowExecutionById(id: string, sanitize: boolean = true) {
    const execution = await this.prisma.workflowExecution.findUnique({ where: { id } });
    if (!execution) throw new NotFoundException(`Workflow execution with ID ${id} not found`);

    if (sanitize) {
      return {
        id: execution.id,
        kind: execution.kind,
        status: execution.status,
        accountingStatus: execution.accountingStatus,
        estimatedCost: execution.estimatedCost,
        createdAt: execution.createdAt,
      };
    }

    return execution;
  }
}
