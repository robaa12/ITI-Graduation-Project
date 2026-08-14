import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminUsers(page: number, limit: number, search?: string, status?: string) {
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.role = status;
    const items = await this.prisma.user.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.user.count({ where });
    return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async updateUserStatus(id: string, status: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return this.prisma.user.update({ where: { id }, data: { status } as any });
  }

  async updateUserRole(id: string, role: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return this.prisma.user.update({ where: { id }, data: { role } as any });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    const hasProjects = await this.prisma.project.count({ where: { userId: id } });
    if (hasProjects > 0) return { id, name: user.name, email: user.email, role: 'deleted' };
    await this.prisma.user.delete({ where: { id } });
    return { id, name: user.name, email: user.email, role: 'user' };
  }

  async getAdminProjects(page: number, limit: number, search?: string, status?: string) {
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    const items = await this.prisma.project.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.project.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminProjectById(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project with ID ${id} not found`);
    return project;
  }

  async updateAdminProjectStatus(id: string, status: 'ACTIVE' | 'ARCHIVED') {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project with ID ${id} not found`);
    return this.prisma.project.update({ where: { id }, data: { status } });
  }

  async deleteAdminProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project with ID ${id} not found`);
    const hasCampaigns = await this.prisma.campaign.count({ where: { projectId: id } });
    if (hasCampaigns > 0) return this.updateAdminProjectStatus(id, 'ARCHIVED');
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }

  async getAdminCampaigns(page: number, limit: number, search?: string, status?: string, projectId?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const items = await this.prisma.campaign.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.campaign.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminCampaignById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign with ID ${id} not found`);
    return campaign;
  }

  async getAdminStrategies(page: number, limit: number, status?: string, approvalStatus?: string, campaignId?: string) {
    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    const items = await this.prisma.marketingStrategy.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.marketingStrategy.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminStrategyById(id: string) {
    const strategy = await this.prisma.marketingStrategy.findUnique({ where: { id } });
    if (!strategy) throw new NotFoundException(`Strategy with ID ${id} not found`);
    return strategy;
  }

  async adminReviewStrategy(id: string, action: 'APPROVE' | 'REJECT', note?: string) {
    const strategy = await this.prisma.marketingStrategy.findUnique({ where: { id } });
    if (!strategy) throw new NotFoundException(`Strategy with ID ${id} not found`);
    let status: 'RUNNING' | 'SUSPENDED';
    if (action === 'APPROVE') status = 'RUNNING';
    else status = 'SUSPENDED';
    return this.prisma.marketingStrategy.update({ where: { id }, data: { status } });
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
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminSocialConnectionById(id: string) {
    const connection = await this.prisma.socialConnection.findUnique({ where: { id }, include: { accounts: true } });
    if (!connection) throw new NotFoundException(`Social connection with ID ${id} not found`);
    return { ...connection, accounts: connection.accounts.map((a: any) => ({ ...a, accessTokenCiphertext: '******** masked ********' })) };
  }

  async getAdminSocialAccounts(page: number, limit: number, platform?: string, available?: boolean, selected?: boolean, userId?: string) {
    const where: any = {};
    if (platform) where.platform = platform;
    if (available !== undefined) where.available = available;
    if (selected !== undefined) where.selected = selected;
    if (userId) where.userId = userId;
    const items = await this.prisma.socialAccount.findMany({ where, skip: (page - 1) * limit, take: limit });
    const total = await this.prisma.socialAccount.count({ where });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminSocialAccountById(id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id }, include: { connection: true } });
    if (!account) throw new NotFoundException(`Social account with ID ${id} not found`);
    const result: any = { ...account, accessTokenCiphertext: '******** masked ********', metadata: {} };
    if (account.connection) {
      result.metadata = { platform: account.connection.provider, status: account.connection.status };
    }
    return result;
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

  // ===== Step 3: Revenue Analytics =====

  async getAdminRevenueOverview(page: number, limit: number) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const successfulPayments = await this.prisma.generationCreditEvent.count({
      where: { refundedAt: null },
    });

    return {
      totalRevenue: 0,
      monthlyRevenue: 0,
      yearlyRevenue: 0,
      successfulPayments,
      averagePayment: 0,
      meta: { page: pageNum, limit: limitNum },
    };
  }

  async getAdminRevenuePerUser(page: number, limit: number, userId?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where = userId ? { userId } : {};

    const events = await this.prisma.generationCreditEvent.findMany({
      where,
      select: { userId: true, amount: true, createdAt: true, refundedAt: true },
      take: limitNum,
      skip: (pageNum - 1) * limitNum,
    });

    const total = await this.prisma.generationCreditEvent.count({ where });

    const userData: Record<string, { totalPaid: number; paymentCount: number; latestPayment: Date | null }> = {};
    for (const event of events) {
      const key = event.userId;
      if (!userData[key]) {
        userData[key] = { totalPaid: 0, paymentCount: 0, latestPayment: null };
      }
      if (event.refundedAt === null) {
        userData[key].totalPaid += event.amount;
        userData[key].paymentCount += 1;
        if (!userData[key].latestPayment || event.createdAt > userData[key].latestPayment) {
          userData[key].latestPayment = event.createdAt;
        }
      }
    }

    const userList = Object.values(userData) as Array<{ userId: string; totalPaid: number; paymentCount: number; latestPayment: Date | null }>;

    return {
      data: userList,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    };
  }

  async getAdminRevenuePerPlan(page: number, limit: number, planId?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where = planId ? { planId } : {};

    const subscriptions = await this.prisma.subscription.findMany({
      where,
      include: { plan: true },
      take: limitNum,
      skip: (pageNum - 1) * limitNum,
    });

    const total = await this.prisma.subscription.count({ where });

    const planData: Record<string, { planCode: string; subscriberCount: number; totalRevenue: number }> = {};
    for (const sub of subscriptions) {
      const planKey = sub.plan?.code;
      if (!planKey) continue;
      if (!planData[planKey]) {
        planData[planKey] = { planCode: planKey, subscriberCount: 0, totalRevenue: 0 };
      }
      planData[planKey].subscriberCount += 1;
      planData[planKey].totalRevenue += 1;
    }

    const planList = Object.values(planData);

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
    if (userId) where.userId = userId;
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

  // ===== Step 3: Email Management =====

  async getAdminEmails(page: number, limit: number, status?: string, userId?: string, startDate?: string, endDate?: string) {
    const pageNum = page || 1;
    const limitNum = limit || 20;

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
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

  async getAdminEmailById(id: string) {
    const email = await this.prisma.workflowExecution.findUnique({ where: { id } });
    if (!email) throw new NotFoundException(`Email with ID ${id} not found`);
    return {
      id: email.id,
      status: email.status,
      createdAt: email.createdAt,
    };
  }

  async cancelAdminEmail(id: string, force: boolean = false) {
    const email = await this.prisma.workflowExecution.findUnique({ where: { id } });
    if (!email) throw new NotFoundException(`Email with ID ${id} not found`);

    // Only allow cancellation if status is PENDING
    if (email.status === 'PENDING') {
      if (force) {
        return this.prisma.workflowExecution.update({
          where: { id },
          data: { status: 'CANCELED' },
        });
      }
      return this.prisma.workflowExecution.update({
        where: { id },
        data: { status: 'CANCELED' },
      });
    }

    if (force) {
      return this.prisma.workflowExecution.update({
        where: { id },
        data: { status: 'CANCELED' },
      });
    }

    throw new BadRequestException('Cannot cancel an email that has already been delivered or processed');
  }

  async retryAdminEmail(id: string) {
    const email = await this.prisma.workflowExecution.findUnique({ where: { id } });
    if (!email) throw new NotFoundException(`Email with ID ${id} not found`);

    // Only allow retry if status is FAILED
    if (email.status !== 'FAILED') {
      throw new BadRequestException('Only failed emails can be retried');
    }

    return this.prisma.workflowExecution.update({
      where: { id },
      data: { status: 'PENDING' },
    });
  }
}