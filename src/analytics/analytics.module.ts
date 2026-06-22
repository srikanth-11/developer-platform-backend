import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from '../api-logs/entities/api-log.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    // We read the ApiLog table directly for aggregation.
    TypeOrmModule.forFeature([ApiLog]),
    OrganizationsModule, // OrgRolesGuard
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
