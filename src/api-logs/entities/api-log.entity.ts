import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * ApiLog — one row per gateway request (table: `api_logs`).
 *
 * This is the raw event stream that the Analytics dashboard (Step 14) will
 * aggregate. We record everything needed to answer "who called what, when, how
 * fast, and with what result".
 *
 * The org/app/key columns are NULLABLE because UNAUTHENTICATED requests (a bad
 * or missing key → 401) are also logged — they just have no identity attached.
 *
 * The composite index (organizationId, createdAt) makes the common analytics
 * query — "this org's requests over a time range" — fast.
 */
@Entity('api_logs')
@Index(['organizationId', 'createdAt'])
export class ApiLog extends AbstractBaseEntity {
  // Correlation id (matches the X-Request-Id header / envelope meta).
  // NOTE: columns typed `string | null` need an EXPLICIT `type` — reflection
  // emits `Object` for a `| null` union, which TypeORM can't map on its own.
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  applicationId: string | null;

  @Column({ name: 'api_key_id', type: 'uuid', nullable: true })
  apiKeyId: string | null;

  @Column()
  method: string;

  @Column()
  endpoint: string;

  @Column({ name: 'status_code', type: 'int' })
  statusCode: number;

  @Column({ name: 'response_time_ms', type: 'int' })
  responseTimeMs: number;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  // `createdAt` (from AbstractBaseEntity) is the request timestamp.
}
