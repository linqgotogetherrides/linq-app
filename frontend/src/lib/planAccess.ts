/**
 * Paid-plan access rules.
 *
 * The server is the source of truth: `user_profiles.plan` and
 * `plan_expires_at` are written only by the payment backend. These helpers turn
 * that row into the app's access state and apply expiry locally so a stale
 * client cannot keep using a plan that has ended.
 */

export type PaidPlan = 'yearly' | 'twoYear';
export type PlanTier = 'free' | PaidPlan;

export interface PlanSnapshot {
  plan: PlanTier;
  planExpiresAt?: string;
}

export interface PlanSource {
  plan?: unknown;
  planExpiresAt?: unknown;
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === 'yearly' || value === 'twoYear';
}

/**
 * Resolves a profile's stored plan into an active tier.
 *
 * A paid plan without a readable future expiry is treated as free. That is the
 * safe default: never grant access from a half-written or forged row.
 */
export function resolvePlan(
  plan: unknown,
  planExpiresAt: unknown,
  now: number = Date.now(),
): PlanSnapshot {
  if (!isPaidPlan(plan)) return { plan: 'free' };
  if (typeof planExpiresAt !== 'string' || !planExpiresAt.trim()) {
    return { plan: 'free' };
  }

  const expiresAt = Date.parse(planExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { plan: 'free' };
  }

  return { plan, planExpiresAt: new Date(expiresAt).toISOString() };
}

export function hasActivePlan(
  access: Pick<PlanSnapshot, 'plan' | 'planExpiresAt'>,
  now: number = Date.now(),
): boolean {
  return resolvePlan(access.plan, access.planExpiresAt, now).plan !== 'free';
}
