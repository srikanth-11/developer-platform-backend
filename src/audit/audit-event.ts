/**
 * The audit event contract.
 *
 * Modules that DO something auditable (auth, api-keys, webhooks, orgs) emit this
 * event via EventEmitter2. They import ONLY this file — a name + a type — and
 * have NO dependency on the audit module/service. The AuditListener (in
 * AuditModule) subscribes and writes the row.
 *
 * That's the decoupling win of event-driven architecture: the doer announces
 * "this happened"; whoever cares (audit, and later notifications/analytics) can
 * react, and you can add reactors without touching the doer.
 */
export const AUDIT_EVENT = 'audit.recorded';

export interface AuditEventPayload {
  /** Dotted action name, e.g. 'apikey.created', 'user.login'. */
  action: string;
  /** Who performed it (null for system/anonymous). */
  actorUserId: string | null;
  /** Which tenant it happened in (null for platform-level events like login). */
  organizationId: string | null;
  /** What was acted on. */
  targetType: string | null;
  targetId: string | null;
  /** Extra context (role assigned, plan chosen, key name, …). */
  metadata?: Record<string, unknown>;
}
