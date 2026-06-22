import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { NotificationStatus } from '../enums/notification-status.enum';

/**
 * Notification — one message to be delivered over one channel (table:
 * `notifications`). A single event (e.g. a webhook failure) can spawn several
 * rows — one per channel it should go out on.
 */
@Entity('notifications')
export class Notification extends AbstractBaseEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  // Optional specific recipient user.
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  // The event kind, e.g. 'webhook.failed', 'ratelimit.exceeded', 'test'.
  @Column()
  type: string;

  @Column({ type: 'enum', enum: ChannelType })
  channel: ChannelType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;
}
