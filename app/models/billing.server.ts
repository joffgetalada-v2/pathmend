import { BillingInterval } from "@shopify/shopify-app-react-router/server";
import { redirect } from "react-router";

import {
  MIGRATION_PLAN_NAME,
  PRO_PLAN_NAME,
  TRIAL_DAYS,
  planHasFeature,
  resolvePlan,
  type GatedFeature,
  type PlanId,
} from "./plans";

/**
 * Structural match for the package's (unexported) BillingConfigWithLineItems
 * so `satisfies` gives contextual typing without widening the plan-name keys.
 */
interface RecurringPlanConfig {
  trialDays: number;
  lineItems: {
    amount: number;
    currencyCode: string;
    interval: BillingInterval.Every30Days;
  }[];
}

/**
 * Billing config passed to shopifyApp(). Keys are the merchant-facing
 * subscription names — they must stay in sync with plans.ts.
 */
export const billingConfig = {
  [PRO_PLAN_NAME]: {
    trialDays: TRIAL_DAYS,
    lineItems: [
      {
        amount: 9.99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
  },
  [MIGRATION_PLAN_NAME]: {
    trialDays: TRIAL_DAYS,
    lineItems: [
      {
        amount: 19.99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
  },
} satisfies Record<string, RecurringPlanConfig>;

/**
 * Structural slice of the billing context returned by authenticate.admin —
 * keeps these helpers decoupled from the package's generics and testable
 * with a plain fake.
 */
export interface ActiveSubscription {
  id: string;
  name: string;
  test: boolean;
}

export interface BillingCheckOptions {
  isTest?: boolean;
  plans?: (typeof PRO_PLAN_NAME | typeof MIGRATION_PLAN_NAME)[];
}

export interface BillingChecker {
  check: (
    options?: BillingCheckOptions,
  ) => Promise<{ appSubscriptions: ActiveSubscription[] }>;
}

export interface PlanContext {
  plan: PlanId;
  /** The subscription backing the resolved plan; null on the free tier. */
  subscription: ActiveSubscription | null;
}

/**
 * Test charges by default outside production so dev stores (which cannot be
 * charged) always work; BILLING_TEST_MODE=true|false overrides either way.
 */
export function isBillingTest(): boolean {
  const override = process.env.BILLING_TEST_MODE;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export async function getPlanContext(
  billing: BillingChecker,
): Promise<PlanContext> {
  // isTest must be explicit: the SDK defaults it to true, which would count
  // unpaid test subscriptions as paid plans in production.
  const { appSubscriptions } = await billing.check({
    isTest: isBillingTest(),
    plans: [PRO_PLAN_NAME, MIGRATION_PLAN_NAME],
  });
  const plan = resolvePlan(appSubscriptions.map((s) => s.name));
  const subscription =
    appSubscriptions.find(
      (s) => resolvePlan([s.name]) === plan && plan !== "free",
    ) ?? null;
  return { plan, subscription };
}

/**
 * Plan gating for loaders/actions: resolves the shop's plan and redirects to
 * the plan page when the feature isn't included. Usage:
 *
 *   const { billing } = await authenticate.admin(request);
 *   await requireFeature(billing, "migration_import");
 */
export async function requireFeature(
  billing: BillingChecker,
  feature: GatedFeature,
): Promise<PlanContext> {
  const context = await getPlanContext(billing);
  if (!planHasFeature(context.plan, feature)) {
    throw redirect("/app/plan");
  }
  return context;
}
