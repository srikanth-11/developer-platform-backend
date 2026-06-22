import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * GatewayTimingInterceptor — wraps every gateway request to:
 *   1. assign a unique REQUEST ID (for correlation across logs/services),
 *   2. measure RESPONSE TIME,
 *   3. shape a consistent response envelope `{ data, meta }`.
 *
 * WHY an interceptor? Interceptors can run code BEFORE the handler (to start a
 * timer) AND transform what it returns AFTER (to add timing) — perfect for
 * cross-cutting concerns. This is the single hook point that Step 10 (request
 * logging) and the analytics phase will tap into: everything needed to log a
 * request (id, duration, status) flows through here.
 *
 * Execution order recap: middleware → guards → interceptor(pre) → handler →
 * interceptor(post). So the API key is already validated by the time we run.
 */
@Injectable()
export class GatewayTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    // The logging middleware (Step 10) already assigned these and set the
    // X-Request-Id header. We reuse them so the envelope's requestId matches the
    // logged row exactly. Fallbacks keep the interceptor usable on its own.
    const requestId: string = request.requestId ?? randomUUID();
    const startedAt: number = request.gatewayStartedAt ?? Date.now();

    return next.handle().pipe(
      map((data) => {
        const responseTimeMs = Date.now() - startedAt;
        response.setHeader('X-Response-Time-Ms', String(responseTimeMs));
        return {
          data,
          meta: {
            requestId,
            responseTimeMs,
            timestamp: new Date(startedAt).toISOString(),
          },
        };
      }),
    );
  }
}
