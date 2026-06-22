import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { DeprecationInterceptor } from './common/interceptors/deprecation.interceptor';
import { WidgetsModule } from './widgets/widgets.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { BillingModule } from './billing/billing.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { DeveloperPortalModule } from './developer-portal/developer-portal.module';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ApplicationsModule } from './applications/applications.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { GatewayModule } from './gateway/gateway.module';
import { ApiLogsModule } from './api-logs/api-logs.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // ConfigModule.forRoot is registered FIRST and made global so every other
    // module can inject ConfigService without re-importing it.
    ConfigModule.forRoot({
      isGlobal: true,
      // `load` runs our typed configuration factory.
      load: [configuration],
      // `validationSchema` enforces the Joi rules at boot — fail fast.
      validationSchema: envValidationSchema,
      // Reads `.env` from the project root.
      envFilePath: '.env',
    }),
    // Global in-process event bus (for audit + future notifications).
    EventEmitterModule.forRoot(),
    // Rate-limit config for brute-force protection (applied to auth routes).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('security.authThrottleTtlMs') ?? 60000,
            limit: config.get<number>('security.authThrottleLimit') ?? 15,
          },
        ],
      }),
    }),
    MonitoringModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    ApplicationsModule,
    ApiKeysModule,
    GatewayModule,
    ApiLogsModule,
    WebhooksModule,
    AuditModule,
    AnalyticsModule,
    NotificationsModule,
    WidgetsModule,
    FeatureFlagsModule,
    BillingModule,
    MarketplaceModule,
    DeveloperPortalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global interceptor: adds deprecation headers to any @Deprecated route.
    { provide: APP_INTERCEPTOR, useClass: DeprecationInterceptor },
  ],
})
export class AppModule {}
