import { beforeEach, describe, expect, test, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../../shopify.server", () => ({
  authenticate: { admin: (request: Request) => authenticateAdmin(request) },
}));

const getPlanContext = vi.fn();
vi.mock("../../models/billing.server", () => ({
  getPlanContext: (billing: unknown) => getPlanContext(billing),
}));

const createRedirect = vi.fn();
vi.mock("../../models/redirects.server", () => ({
  createRedirect: (context: unknown, input: unknown) =>
    createRedirect(context, input),
}));

const setNotFoundStatus = vi.fn();
const listNotFoundEvents = vi.fn();
const notFoundStatusCounts = vi.fn();
vi.mock("../../models/not-found.server", async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    setNotFoundStatus: (shop: string, ids: string[], status: string) =>
      setNotFoundStatus(shop, ids, status),
    listNotFoundEvents: (shop: string, options: unknown) =>
      listNotFoundEvents(shop, options),
    notFoundStatusCounts: (shop: string) => notFoundStatusCounts(shop),
  };
});

import { action } from "../app.notfound";
import { PLAN_FREE } from "../../models/plans";

const SHOP = "example.myshopify.com";

const makeRequest = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return new Request("https://app.example.com/app/notfound", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
};

const makeArgs = (request: Request) => ({ request, params: {}, context: {} });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({
    admin: { graphql: vi.fn() },
    billing: {},
    session: { shop: SHOP },
  });
  getPlanContext.mockResolvedValue({ plan: PLAN_FREE, subscription: null });
  createRedirect.mockResolvedValue({
    status: "created",
    redirect: { id: "gid://1", path: "/old", target: "/new" },
  });
  setNotFoundStatus.mockResolvedValue(2);
});

describe("404 log action — fix", () => {
  test("a crafted 404 path flows only into the redirect source, never the target", async () => {
    // Regression guard: attacker-shaped captured paths (e.g. "//evil.com/x")
    // must reach createRedirect solely as `path`; the destination stays the
    // merchant-typed target, which createRedirect validates separately.
    await action(
      makeArgs(
        makeRequest({
          intent: "fix",
          path: "//evil.com/phish",
          target: "/safe-page",
        }),
      ) as never,
    );

    expect(createRedirect).toHaveBeenCalledWith(expect.anything(), {
      path: "//evil.com/phish",
      target: "/safe-page",
      source: "not_found_fix",
    });
  });

  test("creates a redirect sourced from the 404 log", async () => {
    const response = await action(
      makeArgs(makeRequest({ intent: "fix", path: "/old", target: "/new" })) as never,
    );

    expect(createRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ shop: SHOP, plan: PLAN_FREE }),
      { path: "/old", target: "/new", source: "not_found_fix" },
    );
    expect(response).toMatchObject({ status: "created" });
  });
});

describe("404 log action — bulk fix", () => {
  test("creates one redirect per path and reports the outcome", async () => {
    const response = await action(
      makeArgs(
        makeRequest({
          intent: "bulk_fix",
          paths: JSON.stringify(["/a", "/b"]),
          target: "/new",
        }),
      ) as never,
    );

    expect(createRedirect).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({ status: "bulk_done", created: 2 });
  });

  test("stops at the plan limit and reports it", async () => {
    createRedirect
      .mockResolvedValueOnce({
        status: "created",
        redirect: { id: "gid://1", path: "/a", target: "/new" },
      })
      .mockResolvedValueOnce({ status: "limit_reached", limit: 25 });

    const response = await action(
      makeArgs(
        makeRequest({
          intent: "bulk_fix",
          paths: JSON.stringify(["/a", "/b", "/c"]),
          target: "/new",
        }),
      ) as never,
    );

    expect(createRedirect).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      status: "bulk_done",
      created: 1,
      limitReached: true,
    });
  });

  test("rejects malformed path lists", async () => {
    const response = await action(
      makeArgs(
        makeRequest({ intent: "bulk_fix", paths: "not-json", target: "/new" }),
      ) as never,
    );

    expect(response).toMatchObject({ status: "error" });
    expect(createRedirect).not.toHaveBeenCalled();
  });
});

describe("404 log action — ignore/unignore", () => {
  test("marks the given ids ignored, scoped to the shop", async () => {
    const response = await action(
      makeArgs(
        makeRequest({ intent: "ignore", ids: JSON.stringify(["a", "b"]) }),
      ) as never,
    );

    expect(setNotFoundStatus).toHaveBeenCalledWith(SHOP, ["a", "b"], "ignored");
    expect(response).toMatchObject({ status: "status_updated", count: 2 });
  });

  test("restores ignored events to unresolved", async () => {
    await action(
      makeArgs(
        makeRequest({ intent: "unignore", ids: JSON.stringify(["a"]) }),
      ) as never,
    );

    expect(setNotFoundStatus).toHaveBeenCalledWith(SHOP, ["a"], "unresolved");
  });

  test("rejects non-string ids", async () => {
    const response = await action(
      makeArgs(
        makeRequest({ intent: "ignore", ids: JSON.stringify([1, 2]) }),
      ) as never,
    );

    expect(response).toMatchObject({ status: "error" });
    expect(setNotFoundStatus).not.toHaveBeenCalled();
  });
});

describe("404 log action — unknown intent", () => {
  test("returns an error result", async () => {
    const response = await action(
      makeArgs(makeRequest({ intent: "nonsense" })) as never,
    );
    expect(response).toMatchObject({ status: "error" });
  });
});
