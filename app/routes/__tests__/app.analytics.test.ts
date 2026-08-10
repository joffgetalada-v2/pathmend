import { beforeEach, describe, expect, test, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../../shopify.server", () => ({
  authenticate: { admin: (request: Request) => authenticateAdmin(request) },
}));

const getPlanContext = vi.fn();
vi.mock("../../models/billing.server", () => ({
  getPlanContext: (billing: unknown) => getPlanContext(billing),
}));

const loadAnalytics = vi.fn();
vi.mock("../../models/analytics.server", () => ({
  loadAnalytics: (shop: string, opts: unknown) => loadAnalytics(shop, opts),
}));

import { loader } from "../app.analytics";
import { PLAN_FREE, PLAN_PRO } from "../../models/plans";

const SHOP = "example.myshopify.com";

const makeArgs = () => ({
  request: new Request("https://app.example.com/app/analytics"),
  params: {},
  context: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({
    billing: {},
    session: { shop: SHOP },
  });
  loadAnalytics.mockResolvedValue({
    summary: {
      statusCounts: { unresolved: 0, resolved: 0, ignored: 0 },
      totalHits: 0,
      recoveredVisits: 0,
      redirectsCreated: 0,
    },
    series: [],
    topPaths: [],
    days: 30,
  });
});

describe("analytics loader gating", () => {
  test("free plan gets the upsell, no data query", async () => {
    getPlanContext.mockResolvedValue({ plan: PLAN_FREE, subscription: null });

    const result = await loader(makeArgs() as never);

    expect(result).toEqual({ entitled: false });
    expect(loadAnalytics).not.toHaveBeenCalled();
  });

  test("pro plan loads shop-scoped analytics", async () => {
    getPlanContext.mockResolvedValue({ plan: PLAN_PRO, subscription: null });

    const result = await loader(makeArgs() as never);

    expect(result).toMatchObject({ entitled: true, days: 30 });
    expect(loadAnalytics).toHaveBeenCalledWith(
      SHOP,
      expect.objectContaining({ days: 30 }),
    );
  });
});
