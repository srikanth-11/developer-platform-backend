import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEventPayload } from './audit-event';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /** Persist an audit row. Never throws into the caller (audit is best-effort). */
  async record(payload: AuditEventPayload): Promise<void> {
    try {
      // create() + save() (instead of insert()) types the jsonb `metadata`
      // column cleanly.
      const log = this.auditRepo.create({
        action: payload.action,
        actorUserId: payload.actorUserId,
        organizationId: payload.organizationId,
        targetType: payload.targetType,
        targetId: payload.targetId,
        metadata: payload.metadata ?? null,
      });
      await this.auditRepo.save(log);
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  /** An org's audit trail, newest first. */
  findForOrg(organizationId: string, limit = 50): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
