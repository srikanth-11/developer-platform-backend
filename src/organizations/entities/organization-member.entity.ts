import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../users/entities/user.entity';
import { Organization } from './organization.entity';

/**
 * OrganizationMember — the JOIN table linking a user to an organization, plus
 * the ROLE that user holds in that org (table: `organization_members`).
 *
 * This is a "many-to-many with extra data" relationship: a user can be in many
 * orgs, an org has many users, and each pairing carries its own role.
 *
 * The (organizationId, userId) pair is UNIQUE — a user appears at most once per
 * organization.
 */
@Entity('organization_members')
@Unique(['organizationId', 'userId'])
export class OrganizationMember extends AbstractBaseEntity {
  @Column()
  organizationId: string;

  @ManyToOne(() => Organization, (org) => org.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column()
  userId: string;

  // eager: the member's user is loaded automatically when we list members.
  // onDelete CASCADE: deleting a user removes their memberships.
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: Role, default: Role.DEVELOPER })
  role: Role;
}
