import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('should return paginated users with metadata', async () => {
      const mockUsers = [
        {
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'USER',
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Bob',
          email: 'bob@example.com',
          role: 'USER',
          emailVerified: false,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockTotal = 2;

      jest.spyOn(prisma.user, 'findMany').mockResolvedValue(mockUsers);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(mockTotal);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should apply skip/take correctly', async () => {
      const mockUsers = [
        {
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'USER',
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.user, 'findMany').mockResolvedValue(mockUsers);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(1);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      const mockUser = {
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);

      const result = await service.findOne('1');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update user name and image', async () => {
      const mockUser = {
        id: '1',
        name: 'Updated Name',
        email: 'alice@example.com',
        role: 'USER',
        emailVerified: true,
        image: 'new-image.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);

      const result = await service.update('1', {
        name: 'Updated Name',
        image: 'new-image.jpg',
      });

      expect(result).toEqual(mockUser);
    });

    it('should update only name', async () => {
      const mockUser = {
        id: '1',
        name: 'Updated Name',
        email: 'alice@example.com',
        role: 'USER',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);

      const result = await service.update('1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(result.image).toBeNull();
    });
  });

  describe('changeRole', () => {
    it('should change user role to ADMIN', async () => {
      const mockUser = {
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'ADMIN',
      };

      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);

      const result = await service.changeRole('1', 'ADMIN');

      expect(result.role).toBe('ADMIN');
    });

    it('should throw error for invalid role', async () => {
      await expect(service.changeRole('1', 'SUPER_ADMIN')).rejects.toThrow(
        'Invalid role: SUPER_ADMIN. Must be USER or ADMIN',
      );
    });
  });
});
