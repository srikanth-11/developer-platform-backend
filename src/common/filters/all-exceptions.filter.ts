import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * AllExceptionsFilter — one consistent error shape for the whole API, and a
 * safety net against leaking internals.
 *
 * - Known `HttpException`s (401, 403, 404, validation 400, …) keep their status
 *   and message, so client-facing errors stay informative.
 * - ANY other thrown error becomes a generic 500 with NO stack trace or internal
 *   detail in the response (leaking those is a security risk). The full error is
 *   logged server-side instead.
 *
 * Every error response includes `path`, `timestamp`, and the gateway
 * `requestId` (when present) for correlation with the logs.
 */
// Standard reason phrases so an HttpException without an explicit `error` field
// (e.g. UnauthorizedException) still gets the right label, not a 500 fallback.
const REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? message;
      }
    } else if (
      // Errors that carry an HTTP status (e.g. body-parser's 413
      // PayloadTooLargeError) — honour it instead of masking as 500.
      exception instanceof Error &&
      typeof (exception as { status?: unknown }).status === 'number'
    ) {
      status = (exception as unknown as { status: number }).status;
      message = status < 500 ? exception.message : 'Internal server error';
    } else if (exception instanceof Error) {
      // Truly unknown error — log full detail, reveal nothing to the client.
      this.logger.error(
        `Unhandled error on ${request.method} ${request.originalUrl}: ${exception.message}`,
        exception.stack,
      );
    }

    // Derive the error label from the (possibly overridden) status. An explicit
    // `error` in an HttpException body still wins.
    let error = REASON[status] ?? 'Error';
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as { error?: string };
        if (r.error) error = r.error;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      ...(request.requestId ? { requestId: request.requestId } : {}),
    });
  }
}
