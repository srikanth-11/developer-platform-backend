import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from './audit-event';
// type-only: used as a decorated handler param (isolatedModules requirement).
import type { AuditEventPayload } from './audit-event';
import { AuditService } from './audit.service';

/**
 * AuditListener — subscribes to AUDIT_EVENT and writes the row.
 *
 * `{ async: true }` runs the handler detached from the emitter, so emitting an
 * audit event never blocks (or breaks) the action that triggered it.
 */
@Injectable()
export class AuditListener {
  constructor(private readonly auditService: AuditService) {}

  @OnEvent(AUDIT_EVENT, { async: true })
  async handle(payload: AuditEventPayload): Promise<void> {
    await this.auditService.record(payload);
  }
}
