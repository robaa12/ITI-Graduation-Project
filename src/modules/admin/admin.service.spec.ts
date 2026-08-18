import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowAccountingService } from '../workflow-accounting/workflow-accounting.service';

type UserMock = {
  findMany: jest.Mock;
  count: jest.Mock;
  groupBy: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type PrismaMock = {
  user: UserMock;
  project: { count: jest.Mock; findMany: jest.Mock };
  socialConnection: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock };
  socialAccount: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock };
  socialPublication: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  subscription: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  generationCreditEvent: { count: jest.Mock };
  plan: { findMany: jest.Mock; count: jest.Mock };
  planChangeQuote: { groupBy: jest.Mock };
  workflowExecution: { findMany: jest.Mock };
};

describe('AdminService user management', () => {
  let service: AdminService;
  let prisma: PrismaMock;
  let accounting: { reconcileForPresentation: jest.Mock };

  beforeEach(async () => {
    accounting = {
      reconcileForPresentation: jest.fn(async (executions) => executions),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            project: { count: jest.fn(), findMany: jest.fn() },
            socialConnection: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
            socialAccount: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
            socialPublication: {
              findMany: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
            },
            subscription: {
              findMany: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
            },
            generationCreditEvent: { count: jest.fn() },
            plan: { findMany: jest.fn(), count: jest.fn() },
            planChangeQuote: { groupBy: jest.fn() },
            workflowExecution: { findMany: jest.fn() },
          },
        },
        {
          provide: WorkflowAccountingService,
          useValue: accounting,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as PrismaMock;
  });

  describe('getAdminUsers', () => {
    it('returns paginated users with metadata', async () => {
      const users = [{ id: '1', name: 'Alice' }];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(5);

      const result = await service.getAdminUsers({ page: 1, limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({
        data: users,
        meta: { page: 1, limit: 20, total: 5, totalPages: 1 },
      });
    });

    it('searches name and email case-insensitively at the database level', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getAdminUsers({
        page: 1,
        limit: 20,
        search: 'Ali',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'Ali', mode: 'insensitive' } },
              { email: { contains: 'Ali', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('filters by role', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getAdminUsers({ page: 1, limit: 20, role: 'ADMIN' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'ADMIN' } }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
      });
    });

    it('applies an allowed sort field and direction', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getAdminUsers({
        page: 1,
        limit: 20,
        sortBy: 'email',
        sortOrder: 'DESC',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { email: 'desc' } }),
      );
    });

    it('defaults to newest users first', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getAdminUsers({ page: 2, limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          skip: 20,
          take: 20,
        }),
      );
    });
  });

  describe('getAdminUserStatistics', () => {
    it('returns total users and counts grouped by role', async () => {
      prisma.user.count.mockResolvedValue(3);
      prisma.user.groupBy.mockResolvedValue([
        { role: 'ADMIN', _count: { _all: 1 } },
        { role: 'USER', _count: { _all: 2 } },
      ]);

      const result = await service.getAdminUserStatistics();

      expect(prisma.user.groupBy).toHaveBeenCalledWith({
        by: ['role'],
        _count: { _all: true },
      });
      expect(result).toEqual({
        totalUsers: 3,
        byRole: { ADMIN: 1, USER: 2 },
      });
    });
  });

  describe('getAdminUserById', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getAdminUserById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the user when found', async () => {
      const user = { id: '1', name: 'Alice', role: 'ADMIN' };
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.getAdminUserById('1')).resolves.toEqual(user);
    });
  });

  describe('getAdminUserAnalytics', () => {
    it('aggregates tokens and priced USD cost for every project', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        subscription: { plan: { code: 'pro', name: 'Pro' } },
      });
      prisma.project.findMany.mockResolvedValue([
        {
          id: 'project-1',
          name: 'Launch',
          status: 'ACTIVE',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          _count: { campaigns: 2 },
        },
        {
          id: 'project-2',
          name: 'Empty project',
          status: 'ACTIVE',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
          _count: { campaigns: 0 },
        },
      ]);
      prisma.workflowExecution.findMany.mockResolvedValue([
        {
          id: 'execution-1',
          inputTokens: 100,
          outputTokens: 40,
          totalTokens: 140,
          estimatedCost: 0.0125,
          costUnit: 'USD',
          accountingStatus: 'READY',
          usageCollectedAt: new Date('2026-08-10T00:01:00.000Z'),
          createdAt: new Date('2026-08-10T00:00:00.000Z'),
          strategy: { campaign: { projectId: 'project-1' } },
          contentRun: null,
        },
        {
          id: 'execution-2',
          inputTokens: 80,
          outputTokens: 20,
          totalTokens: 100,
          estimatedCost: null,
          costUnit: null,
          accountingStatus: 'PENDING',
          usageCollectedAt: null,
          createdAt: new Date('2026-08-11T00:00:00.000Z'),
          strategy: null,
          contentRun: { campaign: { projectId: 'project-1' } },
        },
      ]);

      const result = await service.getAdminUserAnalytics('user-1');

      expect(result.totals).toEqual({
        projectCount: 2,
        campaignCount: 2,
        executionCount: 2,
        inputTokens: 180,
        outputTokens: 60,
        totalTokens: 240,
        estimatedCostUsd: 0.0125,
        pricedExecutions: 1,
        recordedUsageExecutions: 1,
        missingAccountingExecutions: 1,
      });
      expect(accounting.reconcileForPresentation).toHaveBeenCalledTimes(1);
      expect(result.projects[0]).toEqual(
        expect.objectContaining({
          id: 'project-1',
          inputTokens: 180,
          outputTokens: 60,
          estimatedCostUsd: 0.0125,
        }),
      );
      expect(result.projects[1]).toEqual(
        expect.objectContaining({ id: 'project-2', executionCount: 0 }),
      );
    });
  });

  describe('updateUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser('missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates only the provided profile fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1' });
      prisma.user.update.mockResolvedValue({ id: '1', name: 'Bob' });

      await service.updateUser('1', { name: 'Bob' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Bob' },
      });
    });
  });

  describe('updateUserRole', () => {
    it('rejects an invalid role', async () => {
      await expect(service.updateUserRole('1', 'SUPERUSER')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUserRole('missing', 'ADMIN')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates the role for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', role: 'USER' });
      prisma.user.update.mockResolvedValue({ id: '1', role: 'ADMIN' });

      await service.updateUserRole('1', 'ADMIN');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { role: 'ADMIN' },
      });
    });
  });

  describe('deleteUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('missing', 'actor')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks admins from deleting their own account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });

      await expect(service.deleteUser('1', '1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('blocks deletion when the user owns related business records', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
      prisma.project.count.mockResolvedValue(2);
      prisma.socialConnection.count.mockResolvedValue(0);
      prisma.subscription.count.mockResolvedValue(0);
      prisma.generationCreditEvent.count.mockResolvedValue(0);

      await expect(service.deleteUser('1', 'actor')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes a user with no related business records', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        name: 'Alice',
        email: 'a@b.com',
        role: 'USER',
      });
      prisma.project.count.mockResolvedValue(0);
      prisma.socialConnection.count.mockResolvedValue(0);
      prisma.subscription.count.mockResolvedValue(0);
      prisma.generationCreditEvent.count.mockResolvedValue(0);
      prisma.user.delete.mockResolvedValue({ id: '1' });

      const result = await service.deleteUser('1', 'actor');

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(
        expect.objectContaining({ id: '1', deleted: true }),
      );
    });
  });

  describe('getAdminSocialConnections', () => {
    it('masks the encrypted access token in the list response', async () => {
      prisma.socialConnection.findMany.mockResolvedValue([
        { id: '1', provider: 'META', accessTokenCiphertext: 'secret' },
      ]);
      prisma.socialConnection.count.mockResolvedValue(1);

      const result = await service.getAdminSocialConnections(1, 20);

      expect(result.items[0].accessTokenCiphertext).toBe(
        '******** masked ********',
      );
      expect(result.items[0].accessTokenCiphertext).not.toBe('secret');
    });

    it('masks tokens in connection detail and nested accounts', async () => {
      prisma.socialConnection.findUnique.mockResolvedValue({
        id: 'connection-1',
        accessTokenCiphertext: 'connection-secret',
        accounts: [{ id: 'account-1', accessTokenCiphertext: 'account-secret' }],
      });

      const result = await service.getAdminSocialConnectionById('connection-1');

      expect(result.accessTokenCiphertext).toBe('******** masked ********');
      expect(result.accounts[0].accessTokenCiphertext).toBe('******** masked ********');
    });
  });

  describe('getAdminSocialAccounts', () => {
    it('masks the encrypted access token in the list response', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        { id: '1', platform: 'FACEBOOK', accessTokenCiphertext: 'secret' },
      ]);
      prisma.socialAccount.count.mockResolvedValue(1);

      const result = await service.getAdminSocialAccounts(1, 20);

      expect(result.items[0].accessTokenCiphertext).toBe(
        '******** masked ********',
      );
      expect(result.items[0].accessTokenCiphertext).not.toBe('secret');
    });

    it('filters accounts through their owning connection user', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([]);
      prisma.socialAccount.count.mockResolvedValue(0);

      await service.getAdminSocialAccounts(1, 20, undefined, undefined, undefined, 'user-1');

      expect(prisma.socialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { connection: { userId: 'user-1' } } }),
      );
    });

    it('masks the token on the nested connection in account detail', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        accessTokenCiphertext: 'account-secret',
        connection: { id: 'connection-1', accessTokenCiphertext: 'connection-secret' },
      });

      const result = await service.getAdminSocialAccountById('account-1');

      expect(result.accessTokenCiphertext).toBe('******** masked ********');
      expect(result.connection.accessTokenCiphertext).toBeUndefined();
    });
  });

  describe('legacy revenue endpoints', () => {
    it('counts accounts with implicit Free access on the Free plan card', async () => {
      prisma.plan.findMany.mockResolvedValue([
        {
          id: 'plan-free',
          code: 'free',
          name: 'Free',
          priceMonthlyCents: 0,
          priceYearlyCents: 0,
          subscriptions: [],
        },
      ]);
      prisma.plan.count.mockResolvedValue(1);
      prisma.planChangeQuote.groupBy.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(3);

      const result = await service.getAdminRevenuePerPlan(1, 20);

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          role: 'USER',
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
                    in: ['INCOMPLETE', 'INCOMPLETE_EXPIRED', 'CANCELLED'],
                  },
                },
              },
            },
          ],
        },
      });
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          planCode: 'free',
          subscriberCount: 3,
          monthlySubscribers: 0,
          yearlySubscribers: 0,
        }),
      );
    });

    it('calculates monthly recurring revenue from current subscriptions', async () => {
      prisma.plan.findMany.mockResolvedValue([
        {
          id: 'plan-pro',
          code: 'pro',
          name: 'Pro',
          priceMonthlyCents: 2500,
          priceYearlyCents: 25000,
          subscriptions: [
            { billingInterval: 'MONTHLY' },
            { billingInterval: 'YEARLY' },
          ],
        },
      ]);
      prisma.plan.count.mockResolvedValue(1);
      prisma.planChangeQuote.groupBy.mockResolvedValue([
        {
          planId: 'plan-pro',
          _sum: { amountDueCents: 3200 },
          _count: { _all: 2 },
        },
      ]);

      const result = await service.getAdminRevenuePerPlan(1, 20);

      expect(result.data).toEqual([
        {
          planId: 'plan-pro',
          planCode: 'pro',
          planName: 'Pro',
          subscriberCount: 2,
          monthlySubscribers: 1,
          yearlySubscribers: 1,
          monthlyRecurringRevenueCents: 4583,
          planChangeRevenueCents: 3200,
          chargedPlanChanges: 2,
        },
      ]);
    });

    it('keeps customer identity and current plan on per-user revenue rows', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          subscription: {
            status: 'ACTIVE',
            plan: { code: 'pro', name: 'Pro', active: true },
          },
        },
      ]);
      prisma.user.count.mockResolvedValue(1);
      prisma.planChangeQuote.groupBy.mockResolvedValue([
        {
          userId: 'user-1',
          _sum: { amountDueCents: 1800 },
          _count: { _all: 2 },
          _max: { consumedAt: new Date('2026-08-17T10:00:00.000Z') },
        },
      ]);

      const result = await service.getAdminRevenuePerUser(1, 20);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
          planCode: 'pro',
          planName: 'Pro',
          subscriptionStatus: 'ACTIVE',
          totalPaid: 1800,
          paymentCount: 2,
        }),
      );
    });

    it('includes users without a subscription as Free customers', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-free',
          name: 'Free User',
          email: 'free@example.com',
          subscription: null,
        },
      ]);
      prisma.user.count.mockResolvedValue(1);
      prisma.planChangeQuote.groupBy.mockResolvedValue([]);

      const result = await service.getAdminRevenuePerUser(1, 20);

      expect(result.data[0]).toEqual({
        userId: 'user-free',
        user: {
          id: 'user-free',
          name: 'Free User',
          email: 'free@example.com',
        },
        planCode: 'free',
        planName: 'Free',
        subscriptionStatus: 'FREE',
        totalPaid: 0,
        paymentCount: 0,
        latestPayment: null,
      });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getAdminSubscriptions', () => {
    it('returns paginated subscriptions with metadata', async () => {
      const subs = [{ id: '1', userId: 'u1' }];
      prisma.subscription.findMany.mockResolvedValue(subs);
      prisma.subscription.count.mockResolvedValue(5);

      const result = await service.getAdminSubscriptions({
        page: 1,
        limit: 20,
      });

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: subs,
        meta: { page: 1, limit: 20, total: 5, totalPages: 1 },
      });
    });

    it('searches subscriptions by user name or email', async () => {
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.subscription.count.mockResolvedValue(0);

      await service.getAdminSubscriptions({
        page: 1,
        limit: 20,
        search: 'Ali',
      });

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user: {
              OR: [
                { name: { contains: 'Ali', mode: 'insensitive' } },
                { email: { contains: 'Ali', mode: 'insensitive' } },
              ],
            },
          },
        }),
      );
    });

    it('filters by subscription status', async () => {
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.subscription.count.mockResolvedValue(0);

      await service.getAdminSubscriptions({
        page: 1,
        limit: 20,
        status: 'ACTIVE',
      });

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
    });
  });

  describe('getAdminSubscriptionById', () => {
    it('throws NotFoundException when the subscription does not exist', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      await expect(service.getAdminSubscriptionById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the subscription with user and plan details', async () => {
      const sub = { id: '1', userId: 'u1', plan: { code: 'pro' } };
      prisma.subscription.findUnique.mockResolvedValue(sub);

      await expect(service.getAdminSubscriptionById('1')).resolves.toEqual(sub);
    });
  });

  describe('getAdminPublications', () => {
    it('returns paginated publications with metadata', async () => {
      const pubs = [{ id: '1', accountName: 'Page' }];
      prisma.socialPublication.findMany.mockResolvedValue(pubs);
      prisma.socialPublication.count.mockResolvedValue(2);

      const result = await service.getAdminPublications({ page: 1, limit: 20 });

      expect(prisma.socialPublication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: pubs,
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      });
    });

    it('filters by status and platform', async () => {
      prisma.socialPublication.findMany.mockResolvedValue([]);
      prisma.socialPublication.count.mockResolvedValue(0);

      await service.getAdminPublications({
        page: 1,
        limit: 20,
        status: 'PUBLISHED',
        platform: 'INSTAGRAM',
      });

      expect(prisma.socialPublication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PUBLISHED', platform: 'INSTAGRAM' },
        }),
      );
    });

    it('searches by account name or content title', async () => {
      prisma.socialPublication.findMany.mockResolvedValue([]);
      prisma.socialPublication.count.mockResolvedValue(0);

      await service.getAdminPublications({ page: 1, limit: 20, search: 'launch' });

      expect(prisma.socialPublication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { accountName: { contains: 'launch', mode: 'insensitive' } },
              {
                content: {
                  title: { contains: 'launch', mode: 'insensitive' },
                },
              },
            ],
          },
        }),
      );
    });
  });

  describe('getAdminPublicationById', () => {
    it('throws NotFoundException when the publication does not exist', async () => {
      prisma.socialPublication.findUnique.mockResolvedValue(null);

      await expect(service.getAdminPublicationById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the publication when found', async () => {
      const pub = { id: '1', accountName: 'Page' };
      prisma.socialPublication.findUnique.mockResolvedValue(pub);

      await expect(service.getAdminPublicationById('1')).resolves.toEqual(pub);
    });
  });
});
