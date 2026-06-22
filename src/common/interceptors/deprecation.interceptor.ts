import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import {
  DEPRECATION_KEY,
  DeprecationOptions,
} from '../decorators/deprecated.decorator';

/**
 * DeprecationInterceptor — global. For any route marked @Deprecated, it adds the
 * standard deprecation signalling headers so API clients can detect and act on
 * deprecation without reading docs:
 *   Deprecation: true
 *   Sunset: <date the version is removed>           (IETF draft)
 *   Link: <migration guide>; rel="sunset"
 *   Warning: 299 - "<message>"
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<DeprecationOptions | undefined>(
      DEPRECATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (meta) {
      const res = context.switchToHttp().getResponse();
      res.setHeader('Deprecation', 'true');
      if (meta.sunset) res.setHeader('Sunset', meta.sunset);
      if (meta.link) res.setHeader('Link', `<${meta.link}>; rel="sunset"`);
      res.setHeader(
        'Warning',
        `299 - "${meta.message ?? 'This API version is deprecated'}"`,
      );
    }

    return next.handle();
  }
}
