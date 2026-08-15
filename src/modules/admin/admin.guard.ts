import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { UserRole } from '../auth/auth.constants';

@Injectable()
export class AdminGuard extends AuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authOk = await super.canActivate(context);
    if (!authOk) {
      return false;
    }

    const user = request.user as AuthenticatedUser & { role: UserRole };
    if (!user.role || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
