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

const matchOldUrls = vi.fn();
vi.mock("../../models/migration.match.server", () => ({
  matchOldUrls: (admin: unknown, urls: string[], opts: unknown) =>
    matchOldUrls(admin, urls, opts),
  DEFAULT_MAX_MATCH_URLS: 500,
}));

const fetchSitemapText = vi.fn();
vi.mock("../../models/migration.server", () => ({
  fetchSitemapText: (url: string) => fetchSitemapText(url),
}));

const createRedirect = vi.fn();
vi.mock("../../models/redirects.server", () => ({
  createRedirect: (context: unknown, input: unknown) =>
    createRedirect(context, input),
}));

import { action } from "../app.migrate";
import { PLAN_MIGRATION } from "../../models/plans";

const SHOP = "example.myshopify.com";

const makeRequest = (fields: Record<string, string>) =>
  new Request("https://app.example.com/app/migrate", {
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
  requireFeature.mockResolvedValue({ plan: PLAN_MIGRATION, subscription: null });
  getPlanContext.mockResolvedValue({ plan: PLAN_MIGRATION, subscription: null });
  matchOldUrls.mockResolvedValue([
    {
      oldUrl: "/products/blue-shirt",
      target: "/products/blue-shirt",
      confidence: "high",
      resourceType: "product",
      title: "Blue Shirt",
    },
  ]);
  fetchSitemapText.mockResolvedValue(
    "<urlset><url><loc>https://old.com/products/blue-shirt</loc></url></urlset>",
  );
  createRedirect.mockResolvedValue({
    status: "created",
    redirect: { id: "gid://1", path: "/x", target: "/y" },
  });
});

describe("migration action gating", () => {
  test("every intent requires the migration_import feature", async () => {
    const gate = new Response(null, {
      status: 302,
      headers: { Location: "/app/plan" },
    });
    requireFeature.mockRejectedValue(gate);

    await expect(
      action(
        makeArgs(makeRequest({ intent: "match_csv", csv: "/a\n" })) as never,
      ),
    ).rejects.toBe(gate);
    expect(matchOldUrls).not.toHaveBeenCalled();
  });
});

describe("match_csv", () => {
  test("parses old URLs from the CSV and returns scored matches", async () => {
    const response = await action(
      makeArgs(
        makeRequest({
          intent: "match_csv",
          csv: "old_url\n/products/blue-shirt\n",
        }),
      ) as never,
    );

    expect(requireFeature).toHaveBeenCalledWith(
      expect.anything(),
      "migration_import",
    );
    expect(matchOldUrls).toHaveBeenCalled();
    expect(response).toMatchObject({ status: "matched" });
  });
});

describe("match_sitemap", () => {
  test("fetches the sitemap, extracts URLs, and matches them", async () => {
    const response = await action(
      makeArgs(
        makeRequest({
          intent: "match_sitemap",
          sitemapUrl: "https://old.com/sitemap.xml",
        }),
      ) as never,
    );

    expect(fetchSitemapText).toHaveBeenCalledWith("https://old.com/sitemap.xml");
    expect(matchOldUrls).toHaveBeenCalled();
    expect(response).toMatchObject({ status: "matched" });
  });

  test("surfaces a fetch error as a friendly message", async () => {
    fetchSitemapText.mockRejectedValue(new Error("That host isn't allowed."));

    const response = await action(
      makeArgs(
        makeRequest({
          intent: "match_sitemap",
          sitemapUrl: "https://169.254.169.254/",
        }),
      ) as never,
    );

    expect(response).toMatchObject({ status: "error" });
    expect(matchOldUrls).not.toHaveBeenCalled();
  });

  test("follows one level of a sitemap index to its child sitemaps", async () => {
    fetchSitemapText
      .mockResolvedValueOnce(
        "<sitemapindex><sitemap><loc>https://old.com/sitemap-1.xml</loc></sitemap></sitemapindex>",
      )
      .mockResolvedValueOnce(
        "<urlset><url><loc>https://old.com/products/blue-shirt</loc></url></urlset>",
      );

    await action(
      makeArgs(
        makeRequest({
          intent: "match_sitemap",
          sitemapUrl: "https://old.com/sitemap.xml",
        }),
      ) as never,
    );

    expect(fetchSitemapText).toHaveBeenCalledTimes(2);
    expect(fetchSitemapText).toHaveBeenNthCalledWith(
      2,
      "https://old.com/sitemap-1.xml",
    );
    // The content URLs from the child sitemap are what get matched.
    expect(matchOldUrls.mock.calls[0]![1]).toContain(
      "https://old.com/products/blue-shirt",
    );
  });
});

describe("apply", () => {
  test("creates approved redirects with source migration", async () => {
    const rows = JSON.stringify([
      { path: "/products/blue-shirt", target: "/products/blue-shirt" },
    ]);

    const response = await action(
      makeArgs(makeRequest({ intent: "apply", rows })) as never,
    );

    expect(createRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ shop: SHOP }),
      { path: "/products/blue-shirt", target: "/products/blue-shirt", source: "migration" },
    );
    expect(response).toMatchObject({ status: "bulk_done", created: 1 });
  });

  test("rejects malformed apply payloads", async () => {
    const response = await action(
      makeArgs(makeRequest({ intent: "apply", rows: "not-json" })) as never,
    );
    expect(response).toMatchObject({ status: "error" });
    expect(createRedirect).not.toHaveBeenCalled();
  });
});
