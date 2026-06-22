import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from '../api-logs/entities/api-log.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { BillingRecord } from './entities/billing-record.entity';
import { Subscription } from './entities/subscription.entity';

@Module({
  imports: [
    // Subscription/invoice tables + ApiLog (usage is COUNTED from gateway logs).
    TypeOrmModule.forFeature([Subscription, BillingRecord, ApiLog]),
    OrganizationsModule, // OrgRolesGuard + OrganizationsService (plan sync)
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeService],
  exports: [BillingService, StripeService],
})
export class BillingModule {}
