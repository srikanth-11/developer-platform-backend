/**
 * Subscription plans. For now they only drive the rate limit; the full billing
 * system arrives in Phase 7. The numbers mirror the project spec.
 */
export enum Plan {
  FREE = 'free', // 100 requests / minute
  PRO = 'pro', // 5,000 requests / minute
  ENTERPRISE = 'enterprise', // custom (set requestsPerMinute explicitly)
}

/** Default requests-per-minute for the fixed plans. */
export const PLAN_RATE_LIMITS: Record<Plan, number> = {
  [Plan.FREE]: 100,
  [Plan.PRO]: 5000,
  [Plan.ENTERPRISE]: 50000,
};
