import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { Plan } from '../../common/enums/plan.enum';

/**
 * BillingRecord — a closed invoice for one billing period (table:
 * `billing_records`). Snapshots usage and the computed charge so the bill is
 * immutable even if usage data is later pruned.
 */
@Entity('billing_records')
export class BillingRecord extends AbstractBaseEntity {
  @Index()
  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: Plan })
  plan: Plan;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  @Column({ name: 'included_requests', type: 'bigint' })
  includedRequests: number;

  @Column({ name: 'used_requests', type: 'bigint' })
  usedRequests: number;

  @Column({ name: 'overage_requests', type: 'bigint' })
  overageRequests: number;

  @Column({ name: 'base_cost', type: 'numeric', precision: 10, scale: 2 })
  baseCost: string;

  @Column({ name: 'overage_cost', type: 'numeric', precision: 10, scale: 2 })
  overageCost: string;

  @Column({ name: 'total_cost', type: 'numeric', precision: 10, scale: 2 })
  totalCost: string;

  @Column({ default: 'open' })
  status: string; // open | invoiced | paid
}
