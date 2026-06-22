import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MarketplaceApi } from './entities/marketplace-api.entity';
import { MarketplaceSubscription } from './entities/marketplace-subscription.entity';
import {
  MarketplaceCatalogController,
  MarketplaceController,
} from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketplaceApi, MarketplaceSubscription]),
    OrganizationsModule, // OrgRolesGuard
    FeatureFlagsModule, // FeatureGuard (api_marketplace gate)
    BillingModule, // Stripe customer + checkout (paid API subscriptions)
  ],
  controllers: [MarketplaceController, MarketplaceCatalogController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
