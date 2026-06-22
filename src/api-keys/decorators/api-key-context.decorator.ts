import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyContextData } from '../api-key-context.interface';

/**
 * `@ApiKeyContext()` — reads the caller identity that ApiKeyGuard attached
 * (key id, application id, organization id). Only meaningful on routes guarded
 * by ApiKeyGuard.
 */
export const ApiKeyContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyContextData => {
    return ctx.switchToHttp().getRequest().apiKeyContext;
  },
);
