import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsModule } from '../applications/applications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    // OrgRolesGuard for the management routes.
    OrganizationsModule,
    // ApplicationsService to validate the app belongs to the org.
    ApplicationsModule,
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard],
  // Export the service AND the guard so the Gateway can authenticate clients.
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
