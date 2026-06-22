import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { FeatureFlag } from './entities/feature-flag.entity';
import {
  AdvancedAnalyticsDemoController,
  FeatureFlagsController,
} from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureGuard } from './guards/feature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag]),
    OrganizationsModule, // OrgRolesGuard
  ],
  controllers: [FeatureFlagsController, AdvancedAnalyticsDemoController],
  providers: [FeatureFlagsService, FeatureGuard],
  // Exported so Marketplace/Billing can gate their routes by feature.
  exports: [FeatureFlagsService, FeatureGuard],
})
export class FeatureFlagsModule {}
