import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiKeyContextData } from '../../api-keys/api-key-context.interface';
import { ApiLogsService } from '../../api-logs/api-logs.service';

/**
 * GatewayLoggingMiddleware — logs EVERY gateway request to api_logs.
 *
 * WHY middleware (not the interceptor)? Middleware runs FIRST in the chain —
 * before guards. So it sees requests that never reach a handler: a 401 from
 * ApiKeyGuard, a 429 from RateLimitGuard, a 502 from routing. By logging on the
 * response's `finish` event (fired after the response is fully sent), we capture
 * the FINAL status code for every outcome, success or failure.
 *
 * It also owns the correlation id (`requestId` / X-Request-Id) and the start
 * time, which the timing interceptor then reuses for its response envelope.
 */
@Injectable()
export class GatewayLoggingMiddleware implements NestMiddleware {
  constructor(private readonly apiLogsService: ApiLogsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = Date.now();

    // Stash for the interceptor + set the correlation header up front.
    (req as any).requestId = requestId;
    (req as any).gatewayStartedAt = startedAt;
    res.setHeader('X-Request-Id', requestId);

    // `finish` fires once the response is completely sent — status is final.
    res.on('finish', () => {
      // The guard attaches this AFTER middleware runs but BEFORE finish fires,
      // so by now it's available (undefined for unauthenticated 401s).
      const ctx = (req as any).apiKeyContext as ApiKeyContextData | undefined;

      // Fire-and-forget: never block or break the response on a logging failure.
      void this.apiLogsService.record({
        requestId,
        organizationId: ctx?.organizationId ?? null,
        applicationId: ctx?.applicationId ?? null,
        apiKeyId: ctx?.keyId ?? null,
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startedAt,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
    });

    next();
  }
}
