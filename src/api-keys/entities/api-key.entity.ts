import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';
import { Application } from '../../applications/entities/application.entity';

/**
 * ApiKey — a credential a client app uses to call the gateway (table: `api_keys`).
 *
 * SECURITY MODEL (this is the important part):
 *   - The full secret key is shown to the user EXACTLY ONCE, at creation.
 *   - We store only a HASH of it (`keyHash`). If our DB leaks, the actual keys
 *     can't be recovered — same principle as password storage.
 *   - For display/identification we keep a non-secret `prefix` and `last4`, so a
 *     user can recognize "which key is this?" in a list without us storing the
 *     secret.
 *
 * The (denormalized) `organizationId` is stored alongside `applicationId` so the
 * gateway (Step 7) can authorize a key against its tenant in a single lookup,
 * with no extra join on the hot path.
 */
@Entity('api_keys')
export class ApiKey extends AbstractBaseEntity {
  // Human label, e.g. "Production server".
  @Column()
  name: string;

  // Non-secret identifier shown in lists, e.g. "dk_test". Safe to store/display.
  @Column()
  prefix: string;

  // Last 4 chars of the secret, for masked display ("dk_test_••••a1b2").
  @Column({ length: 4 })
  last4: string;

  // SHA-256 hash of the FULL key. Unique + indexed: the gateway hashes the
  // incoming key and looks it up here. NEVER stores the plaintext.
  @Index({ unique: true })
  @Column({ name: 'key_hash', unique: true })
  keyHash: string;

  @Index()
  @Column()
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  // Denormalized tenant id (see class comment).
  @Index()
  @Column()
  organizationId: string;

  // Lifecycle timestamps. A key is VALID when revokedAt is null AND it isn't
  // past expiresAt.
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  // Usage tracking (updated by the gateway on each authenticated request).
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'usage_count', type: 'bigint', default: 0 })
  usageCount: number;
}
