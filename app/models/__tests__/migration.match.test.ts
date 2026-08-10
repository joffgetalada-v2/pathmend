import { beforeEach, describe, expect, test, vi } from "vitest";

import { matchOldUrls } from "../migration.match.server";

const graphqlResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }));

// Resource search returns product/collection/page/article nodes by handle.
const makeAdmin = (byHandle: Record<string, unknown[]>) => ({
  graphql: vi.fn((query: string, opts?: { variables?: { query?: string } }) => {
    const search = opts?.variables?.query ?? "";
    // Extract handle:xxx from the search string.
    const handle = /handle:([a-z0-9-]+)/i.exec(search)?.[1] ?? "";
    const nodes = byHandle[handle] ?? [];
    const key = query.includes("products")
      ? "products"
      : query.includes("collections")
        ? "collections"
        : query.includes("pages")
          ? "pages"
          : "articles";
    return Promise.resolve(
      graphqlResponse({ [key]: { nodes } }),
    );
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchOldUrls", () => {
  test("returns a high-confidence match when a product handle matches", async () => {
    const admin = makeAdmin({
      "blue-shirt": [
        { id: "gid://shopify/Product/1", handle: "blue-shirt", title: "Blue Shirt" },
      ],
    });

    const results = await matchOldUrls(admin, ["/products/blue-shirt"]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      oldUrl: "/products/blue-shirt",
      target: "/products/blue-shirt",
      confidence: "high",
      resourceType: "product",
    });
  });

  test("reports unmatched URLs with a null target", async () => {
    const admin = makeAdmin({});

    const results = await matchOldUrls(admin, ["/products/ghost"]);

    expect(results[0]).toMatchObject({
      oldUrl: "/products/ghost",
      target: null,
      confidence: null,
    });
  });

  test("dedupes identical old URLs", async () => {
    const admin = makeAdmin({
      "x": [{ id: "gid://1", handle: "x", title: "X" }],
    });

    const results = await matchOldUrls(admin, ["/products/x", "/products/x"]);

    expect(results).toHaveLength(1);
  });

  test("caps the number of URLs processed", async () => {
    const admin = makeAdmin({});
    const urls = Array.from({ length: 10 }, (_, i) => `/p/${i}`);

    const results = await matchOldUrls(admin, urls, { maxUrls: 3 });

    expect(results).toHaveLength(3);
  });

  test("skips the root and empty slugs without querying", async () => {
    const admin = makeAdmin({});

    const results = await matchOldUrls(admin, ["/", ""]);

    expect(results).toEqual([]);
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});
