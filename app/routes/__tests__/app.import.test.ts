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
const countRedirects = vi.fn();
vi.mock("../../models/redirects.server", () => ({
  createRedirect: (context: unknown, input: unknown) =>
    createRedirect(context, input),
  countRedirects: (shop: string) => countRedirects(shop),
}));

import { action } from "../app.import";
import { PLAN_FREE } from "../../models/plans";

const SHOP = "example.myshopify.com";

const makeRequest = (fields: Record<string, string>) =>
  new Request("https://app.example.com/app/import", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

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
    redirect: { id: "gid://1", path: "/a", target: "/b" },
  });
  countRedirects.mockResolvedValue(0);
});

describe("import action — preview", () => {
  test("returns validated rows and per-line errors without writing", async () => {
    const csv = "path,target\n/a,/b\n/bad,//evil.com\n";

    const response = await action(
      makeArgs(makeRequest({ intent: "preview", csv })) as never,
    );

    expect(response).toMatchObject({ status: "preview" });
    expect((response as { rows: unknown[] }).rows).toEqual([
      { line: 2, path: "/a", target: "/b" },
    ]);
    expect((response as { errors: unknown[] }).errors).toHaveLength(1);
    expect(createRedirect).not.toHaveBeenCalled();
  });

  test("rejects oversized files", async () => {
    const response = await action(
      makeArgs(
        makeRequest({ intent: "preview", csv: "x".repeat(3_000_000) }),
      ) as never,
    );

    expect(response).toMatchObject({ status: "error" });
  });

  test("rejects oversized bodies via Content-Length before parsing", async () => {
    const request = new Request("https://app.example.com/app/import", {
      method: "POST",
      body: new URLSearchParams({ intent: "preview", csv: "x" }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "50000000",
      },
    });

    const response = await action(makeArgs(request) as never);

    expect(response).toMatchObject({ status: "error" });
  });
});

describe("import action — apply", () => {
  test("creates redirects sourced as csv_import", async () => {
    const rows = JSON.stringify([
      { path: "/a", target: "/b" },
      { path: "/c", target: "/d" },
    ]);

    const response = await action(
      makeArgs(makeRequest({ intent: "apply", rows })) as never,
    );

    expect(createRedirect).toHaveBeenCalledTimes(2);
    expect(createRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ shop: SHOP }),
      { path: "/a", target: "/b", source: "csv_import" },
    );
    expect(response).toMatchObject({ status: "bulk_done", created: 2 });
  });

  test("stops at the plan cap and reports it", async () => {
    createRedirect
      .mockResolvedValueOnce({
        status: "created",
        redirect: { id: "gid://1", path: "/a", target: "/b" },
      })
      .mockResolvedValueOnce({ status: "limit_reached", limit: 25 });

    const rows = JSON.stringify([
      { path: "/a", target: "/b" },
      { path: "/c", target: "/d" },
      { path: "/e", target: "/f" },
    ]);

    const response = await action(
      makeArgs(makeRequest({ intent: "apply", rows })) as never,
    );

    expect(createRedirect).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      status: "bulk_done",
      created: 1,
      limitReached: true,
    });
  });

  test("rejects malformed row payloads", async () => {
    for (const rows of [
      "not-json",
      JSON.stringify([{ path: 1, target: "/b" }]),
      JSON.stringify([]),
    ]) {
      const response = await action(
        makeArgs(makeRequest({ intent: "apply", rows })) as never,
      );
      expect(response).toMatchObject({ status: "error" });
    }
    expect(createRedirect).not.toHaveBeenCalled();
  });
});
