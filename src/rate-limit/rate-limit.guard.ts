import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiKeyContextData } from '../api-keys/api-key-context.interface';
import { RateLimitService } from './rate-limit.service';

/**
 * RateLimitGuard — runs AFTER ApiKeyGuard (which set `request.apiKeyContext`).
 *
 * It consumes one unit of the caller's per-minute quota, always sets the
 * standard `X-RateLimit-*` headers (so clients can self-throttle), and throws
 * HTTP 429 with `Retry-After` once the quota is exceeded.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ apiKeyContext?: ApiKeyContextData }>();
    const response = http.getResponse();

    const orgId = request.apiKeyContext?.organizationId;
    // No API-key context → not a rate-limited route; let it pass.
    if (!orgId) return true;

    const result = await this.rateLimitService.consume(orgId);

    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.resetAtEpoch);

    if (!result.allowed) {
      response.setHeader('Retry-After', result.retryAfter);
      // 429 Too Many Requests — the canonical rate-limit response.
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${result.retryAfter}s.`,
          limit: result.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
