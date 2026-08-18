import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const request = {} as Record<string, unknown>;
  const context = new ExecutionContextHost([request]);

  it('allows an authenticated user with the ADMIN role', async () => {
    const authService = {
      getSession: jest.fn().mockResolvedValue({
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          name: 'Admin',
          emailVerified: true,
          role: 'ADMIN',
        },
      }),
    };
    const guard = new AdminGuard(authService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'admin-id', role: 'ADMIN' });
  });

  it('rejects an inactive admin', async () => {
    const authService = {
      getSession: jest.fn().mockResolvedValue({
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          name: 'Admin',
          emailVerified: true,
          role: 'ADMIN',
          active: false,
        },
      }),
    };
    const guard = new AdminGuard(authService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Account inactive',
    );
  });
});
