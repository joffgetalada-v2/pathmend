/**
 * Pure plan/feature logic — no Shopify or framework imports so every rule
 * here is unit-testable. Billing wiring lives in billing.server.ts.
 */

export const PLAN_FREE = "free";
export const PLAN_PRO = "pro";
export const PLAN_MIGRATION = "migration";

export type PlanId = typeof PLAN_FREE | typeof PLAN_PRO | typeof PLAN_MIGRATION;

/**
 * Merchant-facing Shopify subscription names. These are the keys of the
 * billing config in billing.server.ts AND the `name` on AppSubscription —
 * renaming one side silently breaks plan resolution, hence single source here.
 */
export const PRO_PLAN_NAME = "Pro";
export const MIGRATION_PLAN_NAME = "Migration";

export const FREE_ACTIVE_REDIRECT_LIMIT = 25;
export const TRIAL_DAYS = 7;

export type GatedFeature =
  | "unlimited_redirects"
  | "pattern_rules"
  | "analytics"
  | "migration_import";

export interface PlanDefinition {
  id: PlanId;
  /** Display name for the plan page. */
  name: string;
  monthlyPrice: number;
  /** Shopify AppSubscription name; null for the free tier (no subscription). */
  subscriptionName: string | null;
  /** Merchant-facing bullets for the plan page. */
  features: readonly string[];
}

export const PLANS: readonly PlanDefinition[] = [
  {
    id: PLAN_FREE,
    name: "Free",
    monthlyPrice: 0,
    subscriptionName: null,
    features: [
      `Up to ${FREE_ACTIVE_REDIRECT_LIMIT} active redirects`,
      "Automatic 404 detection and logging",
      "One-click redirect fixes",
    ],
  },
  {
    id: PLAN_PRO,
    name: "Pro",
    monthlyPrice: 9.99,
    subscriptionName: PRO_PLAN_NAME,
    features: [
      "Unlimited redirects",
      "Wildcard and pattern rules with auto-heal",
      "404 and redirect analytics",
    ],
  },
  {
    id: PLAN_MIGRATION,
    name: "Migration",
    monthlyPrice: 19.99,
    subscriptionName: MIGRATION_PLAN_NAME,
    features: [
      "Everything in Pro",
      "CSV and sitemap migration importer",
      "Priority support",
    ],
  },
];

const PLAN_RANK: Record<PlanId, number> = {
  [PLAN_FREE]: 0,
  [PLAN_PRO]: 1,
  [PLAN_MIGRATION]: 2,
};

const FEATURE_MIN_PLAN: Record<GatedFeature, PlanId> = {
  unlimited_redirects: PLAN_PRO,
  pattern_rules: PLAN_PRO,
  analytics: PLAN_PRO,
  migration_import: PLAN_MIGRATION,
};

const PLAN_BY_SUBSCRIPTION_NAME: ReadonlyMap<string, PlanId> = new Map(
  PLANS.filter((plan) => plan.subscriptionName !== null).map((plan) => [
    plan.subscriptionName as string,
    plan.id,
  ]),
);

/**
 * Derives the shop's plan from its active Shopify subscription names.
 * Unknown names are ignored; the highest-ranked known plan wins (multiple
 * subscriptions can coexist transiently mid-upgrade).
 */
export function resolvePlan(
  activeSubscriptionNames: readonly string[],
): PlanId {
  return activeSubscriptionNames.reduce<PlanId>((current, name) => {
    const candidate = PLAN_BY_SUBSCRIPTION_NAME.get(name);
    if (candidate === undefined) return current;
    return PLAN_RANK[candidate] > PLAN_RANK[current] ? candidate : current;
  }, PLAN_FREE);
}

export function planHasFeature(plan: PlanId, feature: GatedFeature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function activeRedirectLimit(plan: PlanId): number {
  return plan === PLAN_FREE
    ? FREE_ACTIVE_REDIRECT_LIMIT
    : Number.POSITIVE_INFINITY;
}
