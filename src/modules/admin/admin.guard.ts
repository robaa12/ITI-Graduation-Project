import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/auth.types';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.authService.getSession(request);

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    if (session.user.active === false) {
      throw new UnauthorizedException('Account inactive');
    }

    if (session.user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }

    request.user = session.user;

    return true;
  }
}
