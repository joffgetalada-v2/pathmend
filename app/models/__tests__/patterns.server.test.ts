import { beforeEach, describe, expect, test, vi } from "vitest";

const findManyRules = vi.fn();
const createRule = vi.fn();
const deleteManyRules = vi.fn();
const updateManyRules = vi.fn();
const updateRule = vi.fn();
vi.mock("../../db.server", () => ({
  default: {
    patternRule: {
      findMany: (args: unknown) => findManyRules(args),
      create: (args: unknown) => createRule(args),
      deleteMany: (args: unknown) => deleteManyRules(args),
      updateMany: (args: unknown) => updateManyRules(args),
      update: (args: unknown) => updateRule(args),
    },
  },
}));

const getPlanViaAdmin = vi.fn();
vi.mock("../billing.server", () => ({
  getPlanViaAdmin: (admin: unknown) => getPlanViaAdmin(admin),
}));

const createRedirect = vi.fn();
vi.mock("../redirects.server", () => ({
  createRedirect: (context: unknown, input: unknown) =>
    createRedirect(context, input),
}));

import {
  autoHealNotFound,
  createPatternRule,
  deletePatternRule,
  listPatternRules,
  setPatternRuleEnabled,
} from "../patterns.server";
import { PLAN_FREE, PLAN_PRO } from "../plans";

const SHOP = "example.myshopify.com";
const admin = { graphql: vi.fn() };

const wildcardRule = {
  id: "rule-1",
  shop: SHOP,
  kind: "wildcard",
  pattern: "/blog/*",
  target: "/news/*",
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  findManyRules.mockResolvedValue([]);
  createRule.mockResolvedValue(wildcardRule);
  deleteManyRules.mockResolvedValue({ count: 1 });
  updateManyRules.mockResolvedValue({ count: 1 });
  updateRule.mockResolvedValue({});
  getPlanViaAdmin.mockResolvedValue(PLAN_PRO);
  createRedirect.mockResolvedValue({
    status: "created",
    redirect: { id: "gid://1", path: "/blog/x", target: "/news/x" },
  });
});

describe("pattern rule CRUD", () => {
  test("createPatternRule validates before writing", async () => {
    const result = await createPatternRule(SHOP, {
      kind: "wildcard",
      pattern: "no-slash*",
      target: "/x",
    });

    expect(result.status).toBe("invalid");
    expect(createRule).not.toHaveBeenCalled();
  });

  test("createPatternRule rejects ReDoS regexes the heuristics miss", async () => {
    // (a+a)+ and (.*a)+ pass the cheap pure heuristics but the analyzer gate
    // in createPatternRule rejects them — the shapes that bypassed three
    // hand-rolled attempts.
    for (const pattern of ["(a+a)+", "(.*a)+", "([a-z]+[a-z]+)+"]) {
      const result = await createPatternRule(SHOP, {
        kind: "regex",
        pattern,
        target: "/x",
      });
      expect(result.status).toBe("invalid");
    }
    expect(createRule).not.toHaveBeenCalled();
  });

  test("createPatternRule accepts a safe regex", async () => {
    const result = await createPatternRule(SHOP, {
      kind: "regex",
      pattern: "/p/(\\d+)",
      target: "/products/$1",
    });
    expect(result.status).toBe("created");
  });

  test("createPatternRule stores trimmed values scoped to the shop", async () => {
    const result = await createPatternRule(SHOP, {
      kind: "wildcard",
      pattern: " /blog/* ",
      target: " /news/* ",
    });

    expect(result.status).toBe("created");
    expect(createRule).toHaveBeenCalledWith({
      data: {
        shop: SHOP,
        kind: "wildcard",
        pattern: "/blog/*",
        target: "/news/*",
      },
    });
  });

  test("delete and enable are tenant-scoped", async () => {
    await deletePatternRule(SHOP, "rule-1");
    expect(deleteManyRules).toHaveBeenCalledWith({
      where: { shop: SHOP, id: "rule-1" },
    });

    await setPatternRuleEnabled(SHOP, "rule-1", false);
    expect(updateManyRules).toHaveBeenCalledWith({
      where: { shop: SHOP, id: "rule-1" },
      data: { enabled: false },
    });
  });

  test("listPatternRules orders deterministically", async () => {
    await listPatternRules(SHOP);
    expect(findManyRules).toHaveBeenCalledWith({
      where: { shop: SHOP },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("autoHealNotFound", () => {
  test("returns no_rules without querying the plan", async () => {
    const outcome = await autoHealNotFound(admin, SHOP, "/blog/x");
    expect(outcome).toBe("no_rules");
    expect(getPlanViaAdmin).not.toHaveBeenCalled();
  });

  test("materializes a redirect when a rule matches and the plan allows", async () => {
    findManyRules.mockResolvedValue([wildcardRule]);

    const outcome = await autoHealNotFound(admin, SHOP, "/blog/x");

    expect(outcome).toBe("healed");
    expect(createRedirect).toHaveBeenCalledWith(
      { admin, shop: SHOP, plan: PLAN_PRO },
      { path: "/blog/x", target: "/news/x", source: "auto_heal" },
    );
    expect(updateRule).toHaveBeenCalledWith({
      where: { id: wildcardRule.id },
      data: expect.objectContaining({ hits: { increment: 1 } }),
    });
  });

  test("does not materialize for free-plan shops", async () => {
    findManyRules.mockResolvedValue([wildcardRule]);
    getPlanViaAdmin.mockResolvedValue(PLAN_FREE);

    const outcome = await autoHealNotFound(admin, SHOP, "/blog/x");

    expect(outcome).toBe("not_entitled");
    expect(createRedirect).not.toHaveBeenCalled();
  });

  test("returns no_match without querying the plan", async () => {
    findManyRules.mockResolvedValue([wildcardRule]);

    const outcome = await autoHealNotFound(admin, SHOP, "/pages/other");

    expect(outcome).toBe("no_match");
    expect(getPlanViaAdmin).not.toHaveBeenCalled();
  });

  test("reports failed when the redirect can't be created", async () => {
    findManyRules.mockResolvedValue([wildcardRule]);
    createRedirect.mockResolvedValue({
      status: "invalid",
      errors: [{ message: "nope" }],
    });

    const outcome = await autoHealNotFound(admin, SHOP, "/blog/x");

    expect(outcome).toBe("failed");
    expect(updateRule).not.toHaveBeenCalled();
  });
});
