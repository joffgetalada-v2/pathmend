import { beforeEach, describe, expect, test, vi } from "vitest";

const appProxy = vi.fn();
vi.mock("../../shopify.server", () => ({
  authenticate: {
    public: { appProxy: (request: Request) => appProxy(request) },
  },
}));

const recordNotFoundEvent = vi.fn();
vi.mock("../../models/not-found.server", () => ({
  recordNotFoundEvent: (shop: string, report: unknown) =>
    recordNotFoundEvent(shop, report),
}));

const autoHealNotFound = vi.fn();
vi.mock("../../models/patterns.server", () => ({
  autoHealNotFound: (admin: unknown, shop: string, path: string) =>
    autoHealNotFound(admin, shop, path),
}));

import { action, loader } from "../proxy.404";

// Unique shop per test file run — the rate limiter keeps module-level state.
const SHOP = `proxy-test-${Math.floor(Math.random() * 1e9)}.myshopify.com`;
const ADMIN = { graphql: vi.fn() };

const makeRequest = (body: unknown, init?: RequestInit) =>
  new Request("https://app.example.com/proxy/404", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "User-Agent": "Mozilla/5.0 (iPhone) Mobile Safari" },
    ...init,
  });

const makeArgs = (request: Request) => ({ request, params: {}, context: {} });

beforeEach(() => {
  vi.clearAllMocks();
  appProxy.mockResolvedValue({ session: { shop: SHOP }, admin: ADMIN });
  recordNotFoundEvent.mockResolvedValue("recorded");
  autoHealNotFound.mockResolvedValue("no_rules");
});

describe("proxy 404 action", () => {
  test("records a valid beacon and returns 204", async () => {
    const request = makeRequest({
      path: "/missing-page",
      referrer: "https://google.com",
    });

    const response = await action(makeArgs(request) as never);

    expect(response.status).toBe(204);
    expect(recordNotFoundEvent).toHaveBeenCalledWith(SHOP, {
      path: "/missing-page",
      referrer: "https://google.com",
      deviceType: "mobile",
    });
  });

  test("returns 413 for oversized bodies before parsing", async () => {
    const request = makeRequest({
      path: "/x",
      referrer: "y".repeat(20_000),
    });

    const response = await action(makeArgs(request) as never);

    expect(response.status).toBe(413);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("returns 413 when Content-Length alone exceeds the cap", async () => {
    const request = new Request("https://app.example.com/proxy/404", {
      method: "POST",
      body: JSON.stringify({ path: "/x" }),
      headers: { "Content-Length": "1000000" },
    });

    const response = await action(makeArgs(request) as never);

    expect(response.status).toBe(413);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("returns 400 for malformed JSON", async () => {
    const request = new Request("https://app.example.com/proxy/404", {
      method: "POST",
      body: "not-json",
    });

    const response = await action(makeArgs(request) as never);

    expect(response.status).toBe(400);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("returns 400 when path is missing", async () => {
    const response = await action(
      makeArgs(makeRequest({ referrer: "x" })) as never,
    );

    expect(response.status).toBe(400);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("drops quietly when there is no session", async () => {
    appProxy.mockResolvedValue({ session: undefined });

    const response = await action(
      makeArgs(makeRequest({ path: "/x" })) as never,
    );

    expect(response.status).toBe(204);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("propagates the framework's rejection for invalid signatures", async () => {
    const unauthorized = new Response(null, { status: 401 });
    appProxy.mockRejectedValue(unauthorized);

    await expect(
      action(makeArgs(makeRequest({ path: "/x" })) as never),
    ).rejects.toBe(unauthorized);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });

  test("returns 400 when the recorder rejects the path", async () => {
    recordNotFoundEvent.mockResolvedValue("invalid");

    const response = await action(makeArgs(makeRequest({ path: "/" })) as never);

    expect(response.status).toBe(400);
  });
});

describe("proxy 404 auto-heal", () => {
  test("attempts auto-heal with the normalized path after recording", async () => {
    const response = await action(
      makeArgs(makeRequest({ path: "/Blog/Old-Post/" })) as never,
    );

    expect(response.status).toBe(204);
    expect(autoHealNotFound).toHaveBeenCalledWith(
      ADMIN,
      SHOP,
      "/blog/old-post",
    );
  });

  test("skips auto-heal when the event wasn't recorded", async () => {
    recordNotFoundEvent.mockResolvedValue("capture_disabled");

    await action(makeArgs(makeRequest({ path: "/x" })) as never);

    expect(autoHealNotFound).not.toHaveBeenCalled();
  });

  test("an auto-heal crash never breaks the beacon response", async () => {
    autoHealNotFound.mockRejectedValue(new Error("boom"));

    const response = await action(
      makeArgs(makeRequest({ path: "/x" })) as never,
    );

    expect(response.status).toBe(204);
  });
});

describe("proxy 404 loader", () => {
  test("rejects reads with 405", async () => {
    const request = new Request("https://app.example.com/proxy/404");

    const response = await loader(makeArgs(request) as never);

    expect(response.status).toBe(405);
    expect(recordNotFoundEvent).not.toHaveBeenCalled();
  });
});
