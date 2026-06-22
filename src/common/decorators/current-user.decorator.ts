import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';

/**
 * `@CurrentUser()` — pulls the authenticated user off the request.
 *
 * The JwtStrategy attached the user to `request.user`; this decorator just
 * reads it so controllers can write `me(@CurrentUser() user: User)` instead of
 * digging into the raw request object.
 *
 * Only meaningful on routes protected by JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
