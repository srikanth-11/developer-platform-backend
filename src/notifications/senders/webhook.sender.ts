import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { NotificationSender } from './notification-sender.interface';

/**
 * WebhookSender — simulated (logs). Distinct from the Step 12 webhook SYSTEM
 * (which delivers tenant EVENTS); this is the notification CHANNEL for internal
 * alerts. A real impl would POST to an org-configured alert URL.
 */
@Injectable()
export class WebhookSender implements NotificationSender {
  readonly channel = ChannelType.WEBHOOK;
  private readonly logger = new Logger(WebhookSender.name);

  async send(n: Notification): Promise<void> {
    this.logger.log(`🪝 WEBHOOK → org ${n.organizationId}: ${n.title} — ${n.message}`);
  }
}
