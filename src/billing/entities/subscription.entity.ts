import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { Plan } from '../../common/enums/plan.enum';

/**
 * Subscription — an org's current plan and billing period (table:
 * `subscriptions`). One active subscription per org.
 */
@Entity('subscriptions')
export class Subscription extends AbstractBaseEntity {
  @Index({ unique: true })
  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: Plan })
  plan: Plan;

  @Column({ default: 'active' })
  status: string; // active | canceled | past_due

  // Stripe linkage (null until the org checks out via Stripe).
  @Column({ name: 'stripe_customer_id', type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;

  // The org's Stripe CONNECT account (Express) for receiving marketplace payouts
  // as a publisher. Null until they onboard.
  @Column({ name: 'stripe_connect_account_id', type: 'varchar', nullable: true })
  stripeConnectAccountId: string | null;

  // Cached payout readiness (Stripe `charges_enabled`), kept current by the
  // `account.updated` webhook and refreshed on read.
  @Column({ name: 'payouts_enabled', default: false })
  payoutsEnabled: boolean;

  @Column({ name: 'monthly_quota', type: 'bigint' })
  monthlyQuota: number;

  // `numeric` keeps money exact (no float rounding). pg returns it as a string.
  @Column({ name: 'price_per_month', type: 'numeric', precision: 10, scale: 2 })
  pricePerMonth: string;

  @Column({
    name: 'overage_per_thousand',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  overagePerThousand: string;

  @Column({ name: 'current_period_start', type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd: Date;
}
