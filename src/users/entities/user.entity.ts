import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * User — a person who can log into the platform (table: `users`).
 *
 * NOTE on roles: the spec has Owner/Admin/Developer/Viewer, but those are
 * *per-organization* roles (a user can be Owner of org A and Viewer of org B).
 * So roles do NOT live here — they'll live on the `organization_members` join
 * table in Step 3/4. This entity is pure identity + credentials.
 */
@Entity('users')
export class User extends AbstractBaseEntity {
  // Unique login identity. Indexed because we look users up by email on login.
  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  // We store ONLY the bcrypt hash, never the plaintext password.
  // `select: false` means this column is NOT returned by default queries, so a
  // stray `findOne` can never accidentally leak the hash in an API response.
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ name: 'first_name', nullable: true })
  firstName?: string;

  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  // Lets us deactivate an account without deleting it (audit/history kept).
  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
