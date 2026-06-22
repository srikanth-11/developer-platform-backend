import { Plan } from '../common/enums/plan.enum';

/**
 * Commercial terms per plan. Drives both the rate limit (requestsPerMinute,
 * shared with Step 9) and the monthly bill (quota + price + overage).
 *
 * `overagePerThousand` is charged for every 1,000 requests ABOVE the included
 * monthly quota.
 */
export interface PlanTerms {
  plan: Plan;
  monthlyQuota: number;
  pricePerMonth: number;
  overagePerThousand: number;
  requestsPerMinute: number;
}

export const PLAN_TERMS: Record<Plan, PlanTerms> = {
  [Plan.FREE]: {
    plan: Plan.FREE,
    monthlyQuota: 10_000,
    pricePerMonth: 0,
    overagePerThousand: 0, // free tier: no overage billing (rate limit caps it)
    requestsPerMinute: 100,
  },
  [Plan.PRO]: {
    plan: Plan.PRO,
    monthlyQuota: 1_000_000,
    pricePerMonth: 49,
    overagePerThousand: 0.5,
    requestsPerMinute: 5_000,
  },
  [Plan.ENTERPRISE]: {
    plan: Plan.ENTERPRISE,
    monthlyQuota: 50_000_000,
    pricePerMonth: 999,
    overagePerThousand: 0.2,
    requestsPerMinute: 50_000,
  },
};
