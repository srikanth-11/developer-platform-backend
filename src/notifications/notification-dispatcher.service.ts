import { Injectable } from '@nestjs/common';
import { Notification } from './entities/notification.entity';
import { ChannelType } from './enums/channel-type.enum';
import { EmailSender } from './senders/email.sender';
import { NotificationSender } from './senders/notification-sender.interface';
import { SlackSender } from './senders/slack.sender';
import { WebhookSender } from './senders/webhook.sender';

/**
 * NotificationDispatcher — routes a notification to the right channel adapter.
 * Builds a ChannelType → sender map from the registered senders; `dispatch`
 * looks up and calls the matching one.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly senders = new Map<ChannelType, NotificationSender>();

  constructor(email: EmailSender, slack: SlackSender, webhook: WebhookSender) {
    for (const sender of [email, slack, webhook]) {
      this.senders.set(sender.channel, sender);
    }
  }

  async dispatch(notification: Notification): Promise<void> {
    const sender = this.senders.get(notification.channel);
    if (!sender) {
      throw new Error(`No sender registered for channel ${notification.channel}`);
    }
    await sender.send(notification);
  }
}
