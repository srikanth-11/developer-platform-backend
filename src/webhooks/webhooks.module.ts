import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { QUEUES } from '../queue/queue.constants';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookEvent, WebhookDelivery]),
    // Declares the 'webhooks' queue (the shared connection comes from the global
    // QueueModule's forRoot). Both the producer (service) and worker (processor)
    // resolve it.
    BullModule.registerQueue({ name: QUEUES.WEBHOOKS }),
    OrganizationsModule, // OrgRolesGuard
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksProcessor],
  // Exported so other modules can emit events via dispatchEvent().
  exports: [WebhooksService],
})
export class WebhooksModule {}
