import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectCount = vi.fn();
const redirectUpsert = vi.fn();
const redirectUpdateMany = vi.fn();
const redirectDeleteMany = vi.fn();
const notFoundUpdateMany = vi.fn();
vi.mock("../../db.server", () => ({
  default: {
    redirect: {
      count: (args: unknown) => redirectCount(args),
      upsert: (args: unknown) => redirectUpsert(args),
      updateMany: (args: unknown) => redirectUpdateMany(args),
      deleteMany: (args: unknown) => redirectDeleteMany(args),
    },
    notFoundEvent: {
      updateMany: (args: unknown) => notFoundUpdateMany(args),
    },
  },
}));

import {
  createRedirect,
  deleteRedirect,
  fetchAllRedirects,
  listRedirects,
  updateRedirect,
} from "../redirects.server";
import { PLAN_FREE, PLAN_PRO } from "../plans";

const SHOP = "example.myshopify.com";
const GID = "gid://shopify/UrlRedirect/123";

const graphqlResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }));

const makeAdmin = (data: unknown) => ({
  graphql: vi.fn().mockResolvedValue(graphqlResponse(data)),
});

beforeEach(() => {
  vi.clearAllMocks();
  redirectCount.mockResolvedValue(0);
  redirectUpsert.mockResolvedValue({});
  redirectUpdateMany.mockResolvedValue({ count: 1 });
  redirectDeleteMany.mockResolvedValue({ count: 1 });
  notFoundUpdateMany.mockResolvedValue({ count: 0 });
});

describe("createRedirect", () => {
  const created = {
    urlRedirectCreate: {
      urlRedirect: { id: GID, path: "/old", target: "/new" },
      userErrors: [],
    },
  };

  test("creates in Shopify, mirrors to db, resolves matching 404s", async () => {
    const admin = makeAdmin(created);

    const result = await createRedirect(
      { admin, shop: SHOP, plan: PLAN_FREE },
      { path: "old", target: "/new", source: "manual" },
    );

    expect(result.status).toBe("created");
    const [, options] = admin.graphql.mock.calls[0]!;
    expect(options.variables.urlRedirect).toEqual({
      path: "/old",
      target: "/new",
    });
    expect(redirectUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop_path: { shop: SHOP, path: "/old" } },
      }),
    );
    expect(notFoundUpdateMany).toHaveBeenCalledWith({
      where: { shop: SHOP, path: "/old", status: "unresolved" },
      data: { status: "resolved" },
    });
  });

  test("rejects invalid input without calling Shopify", async () => {
    const admin = makeAdmin(created);

    const result = await createRedirect(
      { admin, shop: SHOP, plan: PLAN_FREE },
      { path: "/old", target: "", source: "manual" },
    );

    expect(result.status).toBe("invalid");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  test("enforces the free plan cap before calling Shopify", async () => {
    redirectCount.mockResolvedValue(25);
    const admin = makeAdmin(created);

    const result = await createRedirect(
      { admin, shop: SHOP, plan: PLAN_FREE },
      { path: "/old", target: "/new", source: "manual" },
    );

    expect(result).toEqual({ status: "limit_reached", limit: 25 });
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  test("does not cap paid plans", async () => {
    redirectCount.mockResolvedValue(9999);
    const admin = makeAdmin(created);

    const result = await createRedirect(
      { admin, shop: SHOP, plan: PLAN_PRO },
      { path: "/old", target: "/new", source: "manual" },
    );

    expect(result.status).toBe("created");
  });

  test("returns Shopify userErrors without mirroring", async () => {
    const admin = makeAdmin({
      urlRedirectCreate: {
        urlRedirect: null,
        userErrors: [{ field: ["urlRedirect", "path"], message: "taken" }],
      },
    });

    const result = await createRedirect(
      { admin, shop: SHOP, plan: PLAN_FREE },
      { path: "/old", target: "/new", source: "manual" },
    );

    expect(result.status).toBe("invalid");
    expect(redirectUpsert).not.toHaveBeenCalled();
  });
});

describe("updateRedirect", () => {
  test("updates Shopify and the db mirror", async () => {
    const admin = makeAdmin({
      urlRedirectUpdate: {
        urlRedirect: { id: GID, path: "/old-2", target: "/new-2" },
        userErrors: [],
      },
    });

    const result = await updateRedirect(
      { admin, shop: SHOP },
      { id: GID, path: "/old-2", target: "/new-2" },
    );

    expect(result.status).toBe("updated");
    expect(redirectUpdateMany).toHaveBeenCalledWith({
      where: { shop: SHOP, shopifyGid: GID },
      data: { path: "/old-2", target: "/new-2" },
    });
  });

  test("rejects invalid input without calling Shopify", async () => {
    const admin = makeAdmin({});

    const result = await updateRedirect(
      { admin, shop: SHOP },
      { id: GID, path: "/same", target: "/same" },
    );

    expect(result.status).toBe("invalid");
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});

describe("deleteRedirect", () => {
  test("deletes from Shopify and the db mirror", async () => {
    const admin = makeAdmin({
      urlRedirectDelete: { deletedUrlRedirectId: GID, userErrors: [] },
    });

    const result = await deleteRedirect({ admin, shop: SHOP }, GID);

    expect(result.status).toBe("deleted");
    expect(redirectDeleteMany).toHaveBeenCalledWith({
      where: { shop: SHOP, shopifyGid: GID },
    });
  });

  test("returns userErrors without touching the mirror", async () => {
    const admin = makeAdmin({
      urlRedirectDelete: {
        deletedUrlRedirectId: null,
        userErrors: [{ field: ["id"], message: "not found" }],
      },
    });

    const result = await deleteRedirect({ admin, shop: SHOP }, GID);

    expect(result.status).toBe("invalid");
    expect(redirectDeleteMany).not.toHaveBeenCalled();
  });
});

describe("listRedirects", () => {
  test("returns nodes and pageInfo, forwarding search and cursors", async () => {
    const admin = makeAdmin({
      urlRedirects: {
        nodes: [{ id: GID, path: "/old", target: "/new" }],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: "a",
          endCursor: "b",
        },
      },
    });

    const result = await listRedirects(admin, {
      search: "old",
      after: "cursor-1",
    });

    expect(result.redirects).toEqual([
      { id: GID, path: "/old", target: "/new" },
    ]);
    expect(result.pageInfo.hasNextPage).toBe(true);
    const [, options] = admin.graphql.mock.calls[0]!;
    expect(options.variables.query).toBe("old");
    expect(options.variables.after).toBe("cursor-1");
  });

  test("fetchAllRedirects follows cursors until exhausted", async () => {
    const pages = [
      {
        urlRedirects: {
          nodes: [{ id: "gid://1", path: "/a", target: "/b" }],
          pageInfo: {
            hasNextPage: true,
            hasPreviousPage: false,
            startCursor: "a",
            endCursor: "cursor-1",
          },
        },
      },
      {
        urlRedirects: {
          nodes: [{ id: "gid://2", path: "/c", target: "/d" }],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: true,
            startCursor: "b",
            endCursor: "cursor-2",
          },
        },
      },
    ];
    const admin = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce(graphqlResponse(pages[0]))
        .mockResolvedValueOnce(graphqlResponse(pages[1])),
    };

    const redirects = await fetchAllRedirects(admin);

    expect(redirects.map((r) => r.path)).toEqual(["/a", "/c"]);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    const secondCall = admin.graphql.mock.calls[1]![1];
    expect(secondCall.variables.after).toBe("cursor-1");
  });

  test("fetchAllRedirects stops at the row cap", async () => {
    const page = {
      urlRedirects: {
        nodes: [{ id: "gid://1", path: "/a", target: "/b" }],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: "a",
          endCursor: "next",
        },
      },
    };
    const admin = {
      // Fresh Response per call — a Response body is single-read.
      graphql: vi.fn().mockImplementation(() =>
        Promise.resolve(graphqlResponse(page)),
      ),
    };

    const redirects = await fetchAllRedirects(admin, { maxRows: 3 });

    expect(redirects).toHaveLength(3);
    expect(admin.graphql).toHaveBeenCalledTimes(3);
  });

  test("quotes pasted URLs so Shopify search matches them literally", async () => {
    const admin = makeAdmin({
      urlRedirects: {
        nodes: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
      },
    });

    await listRedirects(admin, { search: "https://old.com/x" });

    const [, options] = admin.graphql.mock.calls[0]!;
    expect(options.variables.query).toBe('"https://old.com/x"');
  });
});
