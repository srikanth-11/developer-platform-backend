import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * AuditLog — the who-did-what compliance trail (table: `audit_logs`).
 *
 * Different from `api_logs` (which records GATEWAY traffic from client apps):
 * this records ADMINISTRATIVE actions by dashboard USERS — logins, key
 * creation/revocation, member invites, role/plan changes, webhook setup.
 */
@Entity('audit_logs')
@Index(['organizationId', 'createdAt'])
export class AuditLog extends AbstractBaseEntity {
  @Column()
  action: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'target_type', type: 'varchar', nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
