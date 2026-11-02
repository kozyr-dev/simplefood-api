import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest, AuthUser } from '../types/auth.types';

/**
 * The caller, as JwtAuthGuard read it from the access token. Only on routes
 * that need a login: on a `@Public()` route there is no user, and that's a
 * bug in the route (500), not something the client did.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) {
      throw new Error(
        '@CurrentUser() on a route without an authenticated user (is it @Public()?)',
      );
    }
    return user;
  },
);
