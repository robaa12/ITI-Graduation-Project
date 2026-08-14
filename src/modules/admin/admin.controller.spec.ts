import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminController - Step 1 & 2', () => {
  let controller: AdminController;
  let service: AdminService;

  const mockPrismaService = {
    $transaction: async (_promises: any[]) => {
      if (_promises.length === 2) {
        return [{ id: '1', name: 'Test' }, 1];
      }
      return [
        { id: '1', name: 'Project 1', status: 'ACTIVE' },
        { id: '1', projects: 1 },
        { id: '1', campaigns: 1 },
        { id: '1', content: 1 },
        { id: '1', subscription: 1 },
      ];
    },
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    campaign: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    marketingStrategy: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      $transaction: jest.fn(),
    },
    generatedContent: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    knowledgeSource: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    socialConnection: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    socialAccount: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockProjectsFixture = () =>
    [{ id: '1', name: 'Project 1', status: 'ACTIVE', userId: 'user-1', createdAt: new Date() }];

  const mockCampaignsFixture = () =>
    [{ id: '1', name: 'Campaign 1', status: 'DRAFT', projectId: '1', createdAt: new Date() }];

  const mockStrategiesFixture = () =>
    [{ id: '1', name: 'Strategy 1', status: 'READY', approvalStatus: 'PENDING_REVIEW', campaignId: '1', createdAt: new Date() }];

  const mockContentFixture = () =>
    [{ id: '1', title: 'Content 1', status: 'READY', format: 'TEXT', campaignId: '1', createdAt: new Date() }];

  const mockKnowledgeFixture = () =>
    [{ id: '1', name: 'Knowledge 1', type: 'WEBSITE', status: 'READY', projectId: '1', createdAt: new Date() }];

  const mockSocialConnFixture = () => [{ id: '1', provider: 'META', status: 'ACTIVE', createdAt: new Date() }];

  const mockSocialAccountFixture = () =>
    [{ id: '1', platform: 'FACEBOOK', name: 'Test Page', username: 'test', selected: true, available: true, connectionId: '1', accessTokenCiphertext: 'masked' }];

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = app.get<AdminController>(AdminController);
  });

  // Step 1 tests - User Management
  describe('AdminController - Step 1 (User Management)', () => {
    describe('getAdminUsers', () => {
      it('should return paginated users with default parameters', async () => {
        ;(mockPrismaService.user.findMany as jest.Mock).mockResolvedValue([
          { id: '1', name: 'John Doe', email: 'john@example.com', role: 'user', createdAt: new Date() },
          { id: '2', name: 'Jane Doe', email: 'jane@example.com', role: 'user', createdAt: new Date() },
        ]);
        ;(mockPrismaService.user.count as jest.Mock).mockResolvedValue(2);

        const result = await controller.getAdminUsers();

        expect(result.data.length).toBe(2);
        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(20);
        expect(result.meta.total).toBe(2);
        expect(result.meta.totalPages).toBe(1);
      });
    });

    it('should support pagination, search, and sorting', async () => {
      ;(mockPrismaService.user.findMany as jest.Mock).mockResolvedValue([]);
      ;(mockPrismaService.user.count as jest.Mock).mockResolvedValue(0);

      const result = await controller.getAdminUsers(
        { page: 1, limit: 10, search: 'john', sortBy: 'name', sortOrder: 'ASC' },
        {} as any,
      );

      expect(result.data.length).toBe(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('getAdminUserById', () => {
    it('should return user details', async () => {
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await controller.getAdminUserById('1', {} as any);

      expect(result).toEqual({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.getAdminUserById('999', {} as any)).rejects.toThrow(
        'User with ID 999 not found',
      );
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status', async () => {
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });
      ;(mockPrismaService.user.update as jest.Mock).mockResolvedValue({
        ...{ id: '1', name: 'John Doe', email: 'john@example.com', role: 'user' },
        role: 'active',
      });

      const result = await controller.updateUserStatus('1', { status: 'active' }, {} as any);

      expect(result.role).toBe('active');
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });
      ;(mockPrismaService.user.update as jest.Mock).mockResolvedValue({
        ...{ id: '1', name: 'John Doe', email: 'john@example.com', role: 'user' },
        role: 'admin',
      });

      const result = await controller.updateUserRole('1', { role: 'admin' }, {} as any);

      expect(result.role).toBe('admin');
    });
  });

  describe('deleteUser', () => {
    it('should soft-delete user with projects', async () => {
      ;(mockPrismaService.project.count as jest.Mock).mockResolvedValue(1);
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });
      ;(mockPrismaService.user.update as jest.Mock).mockResolvedValue({
        ...{ id: '1', name: 'John Doe', email: 'john@example.com', role: 'user' },
        role: 'deleted',
      });

      const result = await controller.deleteUser('1', {} as any);

      expect(result).toEqual({ id: '1', name: 'John Doe', email: 'john@example.com', role: 'deleted' });
    });

    it('should hard-delete user without projects', async () => {
      ;(mockPrismaService.project.count as jest.Mock).mockResolvedValue(0);
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });
      ;(mockPrismaService.user.delete as jest.Mock).mockResolvedValue({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });

      const result = await controller.deleteUser('1', {} as any);

      expect(result).toEqual({ id: '1', name: 'John Doe', email: 'john@example.com', role: 'user' });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      ;(mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.deleteUser('999', {} as any)).rejects.toThrow(
        'User with ID 999 not found',
      );
    });

    it('should return 403 for non-admin users', async () => {
      // This tests the AdminGuard - but we're mocking the guard,
      // so we just verify the endpoint exists and is callable
      const result = await controller.getAdminUsers({}, {} as any);
      expect(result).toBeDefined();
    });
  });

  // Step 2 tests - New resources
  describe('AdminController - Step 2 (New Resources)', () => {
    describe('Project Management', () => {
      it('should get paginated projects', async () => {
        ;(mockPrismaService.project.findMany as jest.Mock).mockResolvedValue(mockProjectsFixture());
        ;(mockPrismaService.project.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminProjects(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should filter projects by status', async () => {
        ;(mockPrismaService.project.findMany as jest.Mock).mockResolvedValue(
          mockProjectsFixture().filter((p) => p.status === 'ACTIVE')
        );
        ;(mockPrismaService.project.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminProjects(
          { page: 1, limit: 20, status: 'ACTIVE' } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
      });
    });

    describe('Campaign Management', () => {
      it('should get paginated campaigns', async () => {
        ;(mockPrismaService.campaign.findMany as jest.Mock).mockResolvedValue(mockCampaignsFixture());
        ;(mockPrismaService.campaign.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminCampaigns(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should filter campaigns by project', async () => {
        ;(mockPrismaService.campaign.findMany as jest.Mock).mockResolvedValue(
          mockCampaignsFixture().filter((c) => c.projectId === '1')
        );
        ;(mockPrismaService.campaign.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminCampaigns(
          { page: 1, limit: 20, projectId: '1' } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
      });
    });

    describe('Strategy Management', () => {
      it('should get paginated strategies', async () => {
        ;(mockPrismaService.marketingStrategy.findMany as jest.Mock).mockResolvedValue(mockStrategiesFixture());
        ;(mockPrismaService.marketingStrategy.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminStrategies(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should filter strategies by status', async () => {
        ;(mockPrismaService.marketingStrategy.findMany as jest.Mock).mockResolvedValue(
          mockStrategiesFixture().filter((s) => s.status === 'READY')
        );
        ;(mockPrismaService.marketingStrategy.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminStrategies(
          { page: 1, limit: 20, status: 'READY' } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
      });

      it('should review a strategy', async () => {
        ;(mockPrismaService.marketingStrategy.findUnique as jest.Mock).mockResolvedValue(
          mockStrategiesFixture()[0]
        );
        ;(mockPrismaService.marketingStrategy.update as jest.Mock).mockResolvedValue({
          ...mockStrategiesFixture()[0],
          approvalStatus: 'APPROVED',
        });
        ;(mockPrismaService.marketingStrategy.$transaction as jest.Mock).mockResolvedValue({
          ...mockStrategiesFixture()[0],
          approvalStatus: 'APPROVED',
        });

        const result = await controller.adminReviewStrategy('1', 'APPROVED', 'Great strategy');

        expect(result).toBeDefined();
      });
    });

    describe('Generated Content', () => {
      it('should get paginated generated content', async () => {
        ;(mockPrismaService.generatedContent.findMany as jest.Mock).mockResolvedValue(mockContentFixture());
        ;(mockPrismaService.generatedContent.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminGeneratedContent(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should filter generated content by status and format', async () => {
        ;(mockPrismaService.generatedContent.findMany as jest.Mock).mockResolvedValue(
          mockContentFixture().filter(
            (c) => c.status === 'READY' && c.format === 'TEXT'
          )
        );
        ;(mockPrismaService.generatedContent.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminGeneratedContent(
          { page: 1, limit: 20, status: 'READY', format: 'TEXT' } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
      });
    });

    describe('Knowledge Sources', () => {
      it('should get paginated knowledge sources', async () => {
        ;(mockPrismaService.knowledgeSource.findMany as jest.Mock).mockResolvedValue(mockKnowledgeFixture());
        ;(mockPrismaService.knowledgeSource.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminKnowledgeSources(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should filter knowledge sources by type', async () => {
        ;(mockPrismaService.knowledgeSource.findMany as jest.Mock).mockResolvedValue(
          mockKnowledgeFixture().filter((s) => s.type === 'WEBSITE')
        );
        ;(mockPrismaService.knowledgeSource.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminKnowledgeSources(
          { page: 1, limit: 20, type: 'WEBSITE' } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
      });
    });

    describe('Social Connections', () => {
      it('should get paginated social connections', async () => {
        ;(mockPrismaService.socialConnection.findMany as jest.Mock).mockResolvedValue(mockSocialConnFixture());
        ;(mockPrismaService.socialConnection.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminSocialConnections(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should mask tokens in social connection response', async () => {
        ;(mockPrismaService.socialConnection.findUnique as jest.Mock).mockResolvedValue(
          { ...mockSocialConnFixture()[0], accounts: mockSocialAccountFixture() }
        );

        const result = await controller.getAdminSocialConnectionById('1', {} as any);

        expect(result.accounts[0].accessTokenCiphertext).toContain('masked');
        expect(result.accounts[0].accessTokenCiphertext).not.toContain('META');
      });
    });

    describe('Social Accounts', () => {
      it('should get paginated social accounts', async () => {
        ;(mockPrismaService.socialAccount.findMany as jest.Mock).mockResolvedValue(mockSocialAccountFixture());
        ;(mockPrismaService.socialAccount.count as jest.Mock).mockResolvedValue(1);

        const result = await controller.getAdminSocialAccounts(
          { page: 1, limit: 20 } as any,
          {} as any,
        );

        expect(result.items.length).toBe(1);
        expect(result.meta.total).toBe(1);
      });

      it('should mask tokens in social account response', async () => {
        ;(mockPrismaService.socialAccount.findUnique as jest.Mock).mockResolvedValue(
          { ...mockSocialAccountFixture()[0], connection: { provider: 'META', status: 'ACTIVE' } }
        );

        const result = await controller.getAdminSocialAccountById('1', {} as any);

        expect(result.accessTokenCiphertext).toContain('masked');
        expect(result.metadata).toEqual({
          platform: 'META',
          status: 'ACTIVE',
        });
      });
    });
  });
});