import { Column, Entity, Index, Unique } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * MarketplaceSubscription — an org SUBSCRIBING to a published API
 * (table: `marketplace_subscriptions`). Unique per (subscriber, api).
 */
@Entity('marketplace_subscriptions')
@Unique(['subscriberOrganizationId', 'apiId'])
export class MarketplaceSubscription extends AbstractBaseEntity {
  @Index()
  @Column()
  subscriberOrganizationId: string;

  @Index()
  @Column()
  apiId: string;

  @Column({ default: 'active' })
  status: string; // active | canceled

  // Set when the subscription is to a PAID API (charged via Stripe).
  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;
}
