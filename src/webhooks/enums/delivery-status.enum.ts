/**
 * Lifecycle of a single webhook delivery attempt-set.
 *   PENDING  — created, waiting for the worker
 *   SUCCESS  — receiver returned 2xx
 *   FAILED   — last attempt failed, but retries remain
 *   DEAD     — all retries exhausted → dead-letter (needs manual attention)
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  DEAD = 'dead',
}
