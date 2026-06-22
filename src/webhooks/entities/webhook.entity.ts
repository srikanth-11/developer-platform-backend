import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * Webhook — an endpoint an organization registers to RECEIVE events
 * (table: `webhooks`).
 *
 * When something happens in the platform (e.g. an API key is created), we POST a
 * signed payload to every webhook in that org subscribed to that event type.
 */
@Entity('webhooks')
export class Webhook extends AbstractBaseEntity {
  @Index()
  @Column()
  organizationId: string;

  // Where we POST events.
  @Column()
  url: string;

  // Shared secret used to HMAC-sign each delivery so the receiver can verify the
  // request really came from us (and wasn't tampered with). Format: whsec_...
  @Column()
  secret: string;

  // Event types this endpoint wants, e.g. ['apikey.created'] or ['*'] for all.
  // `simple-array` stores them as a comma-separated string.
  @Column({ type: 'simple-array' })
  events: string[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;
}
