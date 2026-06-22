import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { NotificationSender } from './notification-sender.interface';

/** SlackSender — simulated (logs). Real impl would POST to a Slack webhook URL. */
@Injectable()
export class SlackSender implements NotificationSender {
  readonly channel = ChannelType.SLACK;
  private readonly logger = new Logger(SlackSender.name);

  async send(n: Notification): Promise<void> {
    this.logger.log(`💬 SLACK → org ${n.organizationId}: *${n.title}* ${n.message}`);
  }
}
