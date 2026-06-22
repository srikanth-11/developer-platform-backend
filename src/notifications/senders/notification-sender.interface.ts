import { Notification } from '../entities/notification.entity';
import { ChannelType } from '../enums/channel-type.enum';

/**
 * NotificationSender — the pluggable channel adapter interface (Strategy pattern).
 *
 * Each channel (email, Slack, webhook) implements this. To add a new channel
 * (SMS, push, …) you write one class and register it — nothing else changes.
 * The dispatcher picks the right sender by its `channel`.
 */
export interface NotificationSender {
  readonly channel: ChannelType;
  send(notification: Notification): Promise<void>;
}
