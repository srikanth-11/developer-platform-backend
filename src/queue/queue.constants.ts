/**
 * Names of the BullMQ queues (per the project spec). A queue is just a named
 * list in Redis that producers push jobs onto and workers pull jobs off of.
 *
 * We define all four up front so the names are consistent everywhere, but only
 * wire a worker for the ones we've reached:
 *   EMAILS      — welcome / notification emails           (this step: working)
 *   WEBHOOKS    — outbound webhook deliveries + retries   (Step 12)
 *   ANALYTICS   — periodic usage aggregation              (Step 14)
 *   MAINTENANCE — cleanup / housekeeping jobs             (later)
 */
export const QUEUES = {
  EMAILS: 'emails',
  WEBHOOKS: 'webhooks',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  MAINTENANCE: 'maintenance',
} as const;
