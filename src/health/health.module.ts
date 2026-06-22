import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * TerminusModule provides the health-check building blocks
 * (HealthCheckService and the various indicators like TypeOrmHealthIndicator).
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
