import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { OrganizationType } from '../../common/enums/organization-type.enum';
import { Plan } from '../../common/enums/plan.enum';
import { OrganizationMember } from './organization-member.entity';

/**
 * Organization — the top-level TENANT (table: `organizations`).
 *
 * Every piece of data in the platform (applications, API keys, logs, webhooks…)
 * ultimately belongs to exactly one organization. This is the boundary that
 * makes the system multi-tenant: org A can never see org B's data.
 */
@Entity('organizations')
export class Organization extends AbstractBaseEntity {
  @Column()
  name: string;

  // URL-friendly unique identifier, e.g. "acme-corp". Handy for nice URLs and
  // as a stable human-readable handle. Indexed + unique.
  @Index({ unique: true })
  @Column({ unique: true })
  slug: string;

  // Publisher vs subscriber — fixed at creation, drives which dashboard the org
  // gets and what marketplace actions it may perform. Existing rows default to
  // SUBSCRIBER (the consumer-side feature set).
  @Column({ type: 'enum', enum: OrganizationType, default: OrganizationType.SUBSCRIBER })
  type: OrganizationType;

  // Subscription plan — drives the gateway rate limit (Step 9).
  @Column({ type: 'enum', enum: Plan, default: Plan.FREE })
  plan: Plan;

  // Effective per-minute request limit. Kept as its own column (not just derived
  // from `plan`) so Enterprise can set a custom value.
  @Column({ name: 'requests_per_minute', default: 100 })
  requestsPerMinute: number;

  // The membership rows. `members` is the inverse side of the relation defined
  // on OrganizationMember. Not loaded unless explicitly requested.
  @OneToMany(() => OrganizationMember, (member) => member.organization)
  members: OrganizationMember[];
}
