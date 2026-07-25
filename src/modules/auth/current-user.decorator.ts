import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from './auth.guard';
import type { AuthenticatedUser } from './auth.types';

/**
 * Resolves the user attached to the request by {@link AuthGuard}.
 * Only usable on routes protected with that guard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
