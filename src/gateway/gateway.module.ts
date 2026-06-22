import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApiLogsModule } from '../api-logs/api-logs.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayTimingInterceptor } from './interceptors/gateway-timing.interceptor';
import { GatewayLoggingMiddleware } from './middleware/gateway-logging.middleware';

/**
 * GatewayModule — the entry point for client-application traffic.
 *
 * Pipeline: logging middleware → ApiKeyGuard → RateLimitGuard →
 *           timing interceptor → handler.
 */
@Module({
  imports: [ApiKeysModule, RateLimitModule, ApiLogsModule],
  controllers: [GatewayController],
  providers: [GatewayService, GatewayTimingInterceptor, GatewayLoggingMiddleware],
})
export class GatewayModule implements NestModule {
  // Register the logging middleware for every gateway route.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GatewayLoggingMiddleware).forRoutes(GatewayController);
  }
}
