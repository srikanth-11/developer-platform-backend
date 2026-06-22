import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { DeliveryStatus } from '../enums/delivery-status.enum';

/**
 * WebhookDelivery — one attempt-set to deliver one event to one webhook
 * (table: `webhook_deliveries`). This is the delivery LOG: status, attempt
 * count, the receiver's response, and any error.
 */
@Entity('webhook_deliveries')
export class WebhookDelivery extends AbstractBaseEntity {
  @Index()
  @Column()
  webhookId: string;

  @Column()
  eventId: string;

  @Index()
  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  // How many HTTP attempts we've made.
  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;
}
