import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { QUEUES } from '../queue/queue.constants';
import { Notification } from './entities/notification.entity';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { EmailSender } from './senders/email.sender';
import { SlackSender } from './senders/slack.sender';
import { WebhookSender } from './senders/webhook.sender';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
    OrganizationsModule, // OrgRolesGuard
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationsListener,
    NotificationDispatcher,
    EmailSender,
    SlackSender,
    WebhookSender,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
