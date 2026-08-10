import { describe, expect, test } from "vitest";

import {
  FREE_ACTIVE_REDIRECT_LIMIT,
  MIGRATION_PLAN_NAME,
  PLAN_FREE,
  PLAN_MIGRATION,
  PLAN_PRO,
  PLANS,
  PRO_PLAN_NAME,
  activeRedirectLimit,
  planHasFeature,
  resolvePlan,
} from "../plans";

describe("resolvePlan", () => {
  test("returns free when there are no active subscriptions", () => {
    expect(resolvePlan([])).toBe(PLAN_FREE);
  });

  test("returns pro for an active Pro subscription", () => {
    expect(resolvePlan([PRO_PLAN_NAME])).toBe(PLAN_PRO);
  });

  test("returns migration for an active Migration subscription", () => {
    expect(resolvePlan([MIGRATION_PLAN_NAME])).toBe(PLAN_MIGRATION);
  });

  test("returns the highest plan when multiple subscriptions are active", () => {
    // Can happen transiently mid-upgrade before Shopify replaces the old one.
    expect(resolvePlan([PRO_PLAN_NAME, MIGRATION_PLAN_NAME])).toBe(
      PLAN_MIGRATION,
    );
  });

  test("ignores unknown subscription names", () => {
    expect(resolvePlan(["Some Legacy Plan"])).toBe(PLAN_FREE);
    expect(resolvePlan(["Some Legacy Plan", PRO_PLAN_NAME])).toBe(PLAN_PRO);
  });
});

describe("planHasFeature", () => {
  test("free plan has no gated features", () => {
    expect(planHasFeature(PLAN_FREE, "unlimited_redirects")).toBe(false);
    expect(planHasFeature(PLAN_FREE, "pattern_rules")).toBe(false);
    expect(planHasFeature(PLAN_FREE, "analytics")).toBe(false);
    expect(planHasFeature(PLAN_FREE, "migration_import")).toBe(false);
  });

  test("pro plan unlocks everything except migration import", () => {
    expect(planHasFeature(PLAN_PRO, "unlimited_redirects")).toBe(true);
    expect(planHasFeature(PLAN_PRO, "pattern_rules")).toBe(true);
    expect(planHasFeature(PLAN_PRO, "analytics")).toBe(true);
    expect(planHasFeature(PLAN_PRO, "migration_import")).toBe(false);
  });

  test("migration plan unlocks all gated features", () => {
    expect(planHasFeature(PLAN_MIGRATION, "unlimited_redirects")).toBe(true);
    expect(planHasFeature(PLAN_MIGRATION, "pattern_rules")).toBe(true);
    expect(planHasFeature(PLAN_MIGRATION, "analytics")).toBe(true);
    expect(planHasFeature(PLAN_MIGRATION, "migration_import")).toBe(true);
  });
});

describe("activeRedirectLimit", () => {
  test("free plan caps active redirects", () => {
    expect(activeRedirectLimit(PLAN_FREE)).toBe(FREE_ACTIVE_REDIRECT_LIMIT);
    expect(FREE_ACTIVE_REDIRECT_LIMIT).toBe(25);
  });

  test("paid plans are unlimited", () => {
    expect(activeRedirectLimit(PLAN_PRO)).toBe(Number.POSITIVE_INFINITY);
    expect(activeRedirectLimit(PLAN_MIGRATION)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("PLANS", () => {
  test("defines the three spec plans with correct pricing", () => {
    const byId = new Map(PLANS.map((plan) => [plan.id, plan]));
    expect(byId.get(PLAN_FREE)?.monthlyPrice).toBe(0);
    expect(byId.get(PLAN_PRO)?.monthlyPrice).toBe(9.99);
    expect(byId.get(PLAN_MIGRATION)?.monthlyPrice).toBe(19.99);
  });

  test("paid plan subscription names match the billing config keys", () => {
    const byId = new Map(PLANS.map((plan) => [plan.id, plan]));
    expect(byId.get(PLAN_FREE)?.subscriptionName).toBeNull();
    expect(byId.get(PLAN_PRO)?.subscriptionName).toBe(PRO_PLAN_NAME);
    expect(byId.get(PLAN_MIGRATION)?.subscriptionName).toBe(
      MIGRATION_PLAN_NAME,
    );
  });
});
