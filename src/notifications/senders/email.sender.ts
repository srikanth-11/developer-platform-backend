import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { NotificationSender } from './notification-sender.interface';

/**
 * EmailSender — simulated (logs). A real implementation would call an SMTP/email
 * provider here. Kept simulated so the platform runs without external creds.
 */
@Injectable()
export class EmailSender implements NotificationSender {
  readonly channel = ChannelType.EMAIL;
  private readonly logger = new Logger(EmailSender.name);

  async send(n: Notification): Promise<void> {
    this.logger.log(
      `📧 EMAIL → org ${n.organizationId}: "${n.title}" — ${n.message}`,
    );
  }
}
