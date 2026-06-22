import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { ApiStatus, ApiVisibility } from '../enums/marketplace.enums';

/**
 * MarketplaceApi — an API an organization PUBLISHES for others to discover and
 * subscribe to (table: `marketplace_apis`). Think Weather API, Payments API,
 * etc. on RapidAPI.
 */
@Entity('marketplace_apis')
export class MarketplaceApi extends AbstractBaseEntity {
  // The publisher org.
  @Index()
  @Column()
  ownerOrganizationId: string;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ default: 'v1' })
  version: string;

  // Where subscribers' calls would be routed (the upstream).
  @Column({ name: 'base_url' })
  baseUrl: string;

  @Column({ type: 'enum', enum: ApiVisibility, default: ApiVisibility.PUBLIC })
  visibility: ApiVisibility;

  @Column({ type: 'enum', enum: ApiStatus, default: ApiStatus.PUBLISHED })
  status: ApiStatus;

  @Column({
    name: 'price_per_month',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  pricePerMonth: string;
}
