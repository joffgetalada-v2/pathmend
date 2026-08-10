import { afterEach, describe, expect, test, vi } from "vitest";

import {
  billingConfig,
  getPlanContext,
  getPlanViaAdmin,
  isBillingTest,
  requireFeature,
} from "../billing.server";
import {
  MIGRATION_PLAN_NAME,
  PLAN_FREE,
  PLAN_MIGRATION,
  PLAN_PRO,
  PRO_PLAN_NAME,
  TRIAL_DAYS,
} from "../plans";

interface FakeSubscription {
  id: string;
  name: string;
  test: boolean;
}

const fakeBilling = (appSubscriptions: FakeSubscription[]) => ({
  check: vi.fn().mockResolvedValue({
    hasActivePayment: appSubscriptions.length > 0,
    oneTimePurchases: [],
    appSubscriptions,
  }),
});

const proSubscription: FakeSubscription = {
  id: "gid://shopify/AppSubscription/1",
  name: PRO_PLAN_NAME,
  test: true,
};

describe("billingConfig", () => {
  test("defines both paid plans with a 7-day trial", () => {
    expect(billingConfig[PRO_PLAN_NAME]?.trialDays).toBe(TRIAL_DAYS);
    expect(billingConfig[MIGRATION_PLAN_NAME]?.trialDays).toBe(TRIAL_DAYS);
    expect(TRIAL_DAYS).toBe(7);
  });

  test("charges the spec prices in USD every 30 days", () => {
    const pro = billingConfig[PRO_PLAN_NAME]?.lineItems[0];
    const migration = billingConfig[MIGRATION_PLAN_NAME]?.lineItems[0];
    expect(pro).toMatchObject({ amount: 9.99, currencyCode: "USD" });
    expect(migration).toMatchObject({ amount: 19.99, currencyCode: "USD" });
  });
});

describe("getPlanContext", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("excludes test subscriptions in production (isTest: false)", async () => {
    // Regression: billing.check() defaults isTest to true inside the SDK,
    // which would count unpaid test subscriptions as paid plans in production.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST_MODE", "");
    const billing = fakeBilling([]);

    await getPlanContext(billing);

    expect(billing.check).toHaveBeenCalledWith({
      isTest: false,
      plans: [PRO_PLAN_NAME, MIGRATION_PLAN_NAME],
    });
  });

  test("includes test subscriptions outside production (isTest: true)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_TEST_MODE", "");
    const billing = fakeBilling([]);

    await getPlanContext(billing);

    expect(billing.check).toHaveBeenCalledWith({
      isTest: true,
      plans: [PRO_PLAN_NAME, MIGRATION_PLAN_NAME],
    });
  });

  test("maps no subscriptions to the free plan", async () => {
    const context = await getPlanContext(fakeBilling([]));
    expect(context.plan).toBe(PLAN_FREE);
    expect(context.subscription).toBeNull();
  });

  test("maps an active Pro subscription to the pro plan", async () => {
    const context = await getPlanContext(fakeBilling([proSubscription]));
    expect(context.plan).toBe(PLAN_PRO);
    expect(context.subscription?.id).toBe(proSubscription.id);
  });

  test("prefers the migration subscription when both are active", async () => {
    const migrationSubscription: FakeSubscription = {
      id: "gid://shopify/AppSubscription/2",
      name: MIGRATION_PLAN_NAME,
      test: true,
    };
    const context = await getPlanContext(
      fakeBilling([proSubscription, migrationSubscription]),
    );
    expect(context.plan).toBe(PLAN_MIGRATION);
    expect(context.subscription?.id).toBe(migrationSubscription.id);
  });
});

describe("requireFeature", () => {
  test("redirects free shops to the plan page for gated features", async () => {
    const gated = requireFeature(fakeBilling([]), "pattern_rules");
    await expect(gated).rejects.toSatisfy((thrown: unknown) => {
      const response = thrown as Response;
      return (
        response.status === 302 &&
        response.headers.get("Location") === "/app/plan"
      );
    });
  });

  test("redirects pro shops for migration-only features", async () => {
    const gated = requireFeature(
      fakeBilling([proSubscription]),
      "migration_import",
    );
    await expect(gated).rejects.toSatisfy(
      (thrown: unknown) => (thrown as Response).status === 302,
    );
  });

  test("returns the plan context when the feature is allowed", async () => {
    const context = await requireFeature(
      fakeBilling([proSubscription]),
      "pattern_rules",
    );
    expect(context.plan).toBe(PLAN_PRO);
  });
});

describe("getPlanViaAdmin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const adminWith = (
    subscriptions: { name: string; test: boolean; status: string }[],
  ) => ({
    graphql: vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            currentAppInstallation: { activeSubscriptions: subscriptions },
          },
        }),
      ),
    ),
  });

  test("resolves the plan from active subscription names", async () => {
    const admin = adminWith([
      { name: PRO_PLAN_NAME, test: true, status: "ACTIVE" },
    ]);
    expect(await getPlanViaAdmin(admin)).toBe(PLAN_PRO);
  });

  test("ignores test subscriptions in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST_MODE", "");
    const admin = adminWith([
      { name: PRO_PLAN_NAME, test: true, status: "ACTIVE" },
    ]);
    expect(await getPlanViaAdmin(admin)).toBe(PLAN_FREE);
  });

  test("returns free when the query yields nothing", async () => {
    const admin = {
      graphql: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: {} }))),
    };
    expect(await getPlanViaAdmin(admin)).toBe(PLAN_FREE);
  });
});

describe("isBillingTest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("defaults to test charges outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_TEST_MODE", "");
    expect(isBillingTest()).toBe(true);
  });

  test("defaults to real charges in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST_MODE", "");
    expect(isBillingTest()).toBe(false);
  });

  test("BILLING_TEST_MODE overrides the environment default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST_MODE", "true");
    expect(isBillingTest()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_TEST_MODE", "false");
    expect(isBillingTest()).toBe(false);
  });
});
