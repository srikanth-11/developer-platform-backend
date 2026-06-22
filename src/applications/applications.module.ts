import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { Application } from './entities/application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application]),
    // Import OrganizationsModule to reuse OrgRolesGuard (and its underlying
    // OrganizationsService) for membership/role checks on these nested routes.
    OrganizationsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  // Exported so the ApiKey module (Step 6) can validate an app belongs to an org.
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
