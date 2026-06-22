/**
 * Domain events that should trigger notifications.
 *
 * Like the audit contract (Step 13), this is just names + types. The modules
 * that DETECT these conditions (webhooks, rate-limit) emit the event via
 * EventEmitter2 and import ONLY this file — they have no dependency on the
 * notifications module. The NotificationsListener reacts.
 */
export const WEBHOOK_FAILED_EVENT = 'notify.webhook.failed';
export const RATELIMIT_EXCEEDED_EVENT = 'notify.ratelimit.exceeded';

export interface WebhookFailedPayload {
  organizationId: string;
  webhookId: string;
  deliveryId: string;
  error: string;
}

export interface RateLimitExceededPayload {
  organizationId: string;
  limit: number;
}
