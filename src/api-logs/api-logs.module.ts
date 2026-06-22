import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApiLogsController } from './api-logs.controller';
import { ApiLogsService } from './api-logs.service';
import { ApiLog } from './entities/api-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiLog]),
    OrganizationsModule, // OrgRolesGuard for the logs-read route
  ],
  controllers: [ApiLogsController],
  providers: [ApiLogsService],
  // Exported so the gateway middleware can write log rows.
  exports: [ApiLogsService],
})
export class ApiLogsModule {}
