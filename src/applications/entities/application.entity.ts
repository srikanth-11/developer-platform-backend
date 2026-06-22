import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Application — a client app registered inside an organization
 * (table: `applications`). Examples: "Mobile App", "Partner Integration".
 *
 * An application is the thing that will own API keys (Step 6) and make gateway
 * requests (Step 8). It always belongs to exactly one organization — that FK is
 * what keeps applications tenant-isolated.
 */
@Entity('applications')
export class Application extends AbstractBaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  // Foreign key to the owning org. Indexed because we constantly filter
  // applications "where organizationId = ...".
  @Index()
  @Column()
  organizationId: string;

  // Deleting an organization deletes its applications (CASCADE).
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  // Lets us disable an app (and later, reject its keys) without deleting it.
  @Column({ default: true })
  isActive: boolean;
}
