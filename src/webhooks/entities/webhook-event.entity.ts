import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * WebhookEvent — an event that OCCURRED and is worth notifying about
 * (table: `webhook_events`). One event can fan out to many deliveries (one per
 * subscribed webhook).
 */
@Entity('webhook_events')
export class WebhookEvent extends AbstractBaseEntity {
  @Index()
  @Column()
  organizationId: string;

  // e.g. 'apikey.created', 'webhook.test'
  @Column()
  type: string;

  // The event body we send to receivers. jsonb = queryable JSON in Postgres.
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;
}
