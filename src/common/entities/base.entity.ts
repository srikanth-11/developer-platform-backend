import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AbstractBaseEntity
 *
 * Shared columns that almost every table in the platform needs:
 *  - a UUID primary key (better than auto-increment integers for a multi-tenant
 *    API platform: non-guessable, safe to expose, no cross-tenant ID collisions)
 *  - created/updated timestamps maintained automatically by TypeORM.
 *
 * Concrete entities (User, Organization, ApiKey, ...) extend this so we never
 * repeat these three columns. `abstract` means it never becomes its own table.
 */
export abstract class AbstractBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
