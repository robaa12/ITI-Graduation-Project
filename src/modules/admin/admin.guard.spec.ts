import { Test, TestingModule } from '@nestjs/testing';
import { AdminGuard } from './admin.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/auth.types';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let authService: AuthService;
  let prismaService: PrismaService;

  const makeMockRequest = (user?: Partial<AuthenticatedUser>): any => ({
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      emailVerified: false,
      image: null,
      ...user,
    } as const,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        {
          provide: AuthService,
          useValue: {
            getSession: jest.fn(),
            isEmailRegistered: jest.fn(),
            handle: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
    authService = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('when user is authenticated as ADMIN', () => {
    it('should allow access', async () => {
      const mockUser: AuthenticatedUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
        emailVerified: true,
        image: null,
        role: UserRole.ADMIN,
      };

      const request = makeMockRequest({ role: UserRole.ADMIN });

      jest.spyOn(authService, 'getSession').mockResolvedValue({
        user: mockUser,
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as const;

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('when user is authenticated as USER', () => {
    it('should forbid access (returns false)', async () => {
      const mockUser: AuthenticatedUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        emailVerified: true,
        image: null,
        role: UserRole.USER,
      };

      const request = makeMockRequest({ role: UserRole.USER });

      jest.spyOn(authService, 'getSession').mockResolvedValue({
        user: mockUser,
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as const;

      await expect(guard.canActivate(context)).resolves.toBe(false);
    });
  });

  describe('when user is unauthenticated', () => {
    it('should reject (returns false)', async () => {
      const request = makeMockRequest();

      jest.spyOn(authService, 'getSession').mockResolvedValue(null);

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as const;

      await expect(guard.canActivate(context)).resolves.toBe(false);
    });
  });
});