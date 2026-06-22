import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MonitoringService } from './monitoring.service';

/**
 * MonitoringModule — @Global so main.ts can grab MonitoringService to install
 * the per-request metrics middleware.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
