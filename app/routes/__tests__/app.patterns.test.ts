import { beforeEach, describe, expect, test, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../../shopify.server", () => ({
  authenticate: { admin: (request: Request) => authenticateAdmin(request) },
}));

const requireFeature = vi.fn();
const getPlanContext = vi.fn();
vi.mock("../../models/billing.server", () => ({
  requireFeature: (billing: unknown, feature: string) =>
    requireFeature(billing, feature),
  getPlanContext: (billing: unknown) => getPlanContext(billing),
}));

const createPatternRule = vi.fn();
const deletePatternRule = vi.fn();
const setPatternRuleEnabled = vi.fn();
const listPatternRules = vi.fn();
vi.mock("../../models/patterns.server", () => ({
  createPatternRule: (shop: string, input: unknown) =>
    createPatternRule(shop, input),
  deletePatternRule: (shop: string, id: string) => deletePatternRule(shop, id),
  setPatternRuleEnabled: (shop: string, id: string, enabled: boolean) =>
    setPatternRuleEnabled(shop, id, enabled),
  listPatternRules: (shop: string) => listPatternRules(shop),
}));

import { action } from "../app.patterns";
import { PLAN_PRO } from "../../models/plans";

const SHOP = "example.myshopify.com";

const makeRequest = (fields: Record<string, string>) =>
  new Request("https://app.example.com/app/patterns", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

const makeArgs = (request: Request) => ({ request, params: {}, context: {} });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({
    billing: {},
    session: { shop: SHOP },
  });
  requireFeature.mockResolvedValue({ plan: PLAN_PRO, subscription: null });
  createPatternRule.mockResolvedValue({
    status: "created",
    rule: { id: "rule-1" },
  });
  deletePatternRule.mockResolvedValue(1);
  setPatternRuleEnabled.mockResolvedValue(1);
});

describe("pattern rules action", () => {
  test("every intent is gated on the pattern_rules feature", async () => {
    const gateRedirect = new Response(null, {
      status: 302,
      headers: { Location: "/app/plan" },
    });
    requireFeature.mockRejectedValue(gateRedirect);

    await expect(
      action(
        makeArgs(
          makeRequest({
            intent: "create",
            kind: "wildcard",
            pattern: "/a/*",
            target: "/b/*",
          }),
        ) as never,
      ),
    ).rejects.toBe(gateRedirect);
    expect(createPatternRule).not.toHaveBeenCalled();
  });

  test("create passes the validated fields through", async () => {
    const response = await action(
      makeArgs(
        makeRequest({
          intent: "create",
          kind: "regex",
          pattern: "/p/(\\d+)",
          target: "/products/$1",
        }),
      ) as never,
    );

    expect(requireFeature).toHaveBeenCalledWith(
      expect.anything(),
      "pattern_rules",
    );
    expect(createPatternRule).toHaveBeenCalledWith(SHOP, {
      kind: "regex",
      pattern: "/p/(\\d+)",
      target: "/products/$1",
    });
    expect(response).toMatchObject({ status: "created" });
  });

  test("rejects unknown kinds before touching the db", async () => {
    const response = await action(
      makeArgs(
        makeRequest({
          intent: "create",
          kind: "glob",
          pattern: "/a/*",
          target: "/b",
        }),
      ) as never,
    );

    expect(response).toMatchObject({ status: "error" });
    expect(createPatternRule).not.toHaveBeenCalled();
  });

  test("delete and toggle are shop-scoped", async () => {
    await action(
      makeArgs(makeRequest({ intent: "delete", id: "rule-1" })) as never,
    );
    expect(deletePatternRule).toHaveBeenCalledWith(SHOP, "rule-1");

    await action(
      makeArgs(
        makeRequest({ intent: "toggle", id: "rule-1", enabled: "false" }),
      ) as never,
    );
    expect(setPatternRuleEnabled).toHaveBeenCalledWith(SHOP, "rule-1", false);
  });
});
