import { describe, expect, test, vi } from "vitest";

import { fetchSitemapText } from "../migration.server";

const makeDeps = (overrides: Partial<Parameters<typeof fetchSitemapText>[1]> = {}) => ({
  resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
  fetchImpl: vi.fn().mockResolvedValue(
    new Response("<urlset><url><loc>https://old.com/a</loc></url></urlset>", {
      status: 200,
      headers: { "content-type": "application/xml" },
    }),
  ),
  ...overrides,
});

describe("fetchSitemapText", () => {
  test("fetches a public https sitemap and returns its text", async () => {
    const deps = makeDeps();
    const text = await fetchSitemapText("https://old.com/sitemap.xml", deps);
    expect(text).toContain("<loc>");
    expect(deps.fetchImpl).toHaveBeenCalledOnce();
    // Redirects are not followed.
    const init = vi.mocked(deps.fetchImpl).mock.calls[0]![1];
    expect(init?.redirect).toBe("manual");
  });

  test("rejects a non-public URL before any DNS or fetch", async () => {
    const deps = makeDeps();
    await expect(
      fetchSitemapText("https://169.254.169.254/latest/", deps),
    ).rejects.toThrow();
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects when DNS resolves to a private IP (rebinding guard)", async () => {
    const deps = makeDeps({
      resolve: vi.fn().mockResolvedValue(["10.0.0.5"]),
    });
    await expect(
      fetchSitemapText("https://sneaky.com/sitemap.xml", deps),
    ).rejects.toThrow();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects when ANY resolved IP is private, not just the first", async () => {
    const deps = makeDeps({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34", "169.254.169.254"]),
    });
    await expect(
      fetchSitemapText("https://sneaky.com/sitemap.xml", deps),
    ).rejects.toThrow();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  test("resolves the bare hostname (no brackets) so the guard runs reliably", async () => {
    const deps = makeDeps();
    await fetchSitemapText("https://old.com/sitemap.xml", deps);
    expect(deps.resolve).toHaveBeenCalledWith("old.com");
  });

  test("rejects a redirect response instead of following it", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/" },
        }),
      ),
    });
    await expect(
      fetchSitemapText("https://old.com/sitemap.xml", deps),
    ).rejects.toThrow();
  });

  test("rejects a non-2xx response", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 404 })),
    });
    await expect(
      fetchSitemapText("https://old.com/sitemap.xml", deps),
    ).rejects.toThrow();
  });

  test("rejects an over-large body (Content-Length)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("<urlset/>", {
          status: 200,
          headers: { "content-length": String(20 * 1024 * 1024) },
        }),
      ),
    });
    await expect(
      fetchSitemapText("https://old.com/sitemap.xml", deps),
    ).rejects.toThrow();
  });

  test("rejects a body that exceeds the cap while streaming", async () => {
    const huge = "x".repeat(11 * 1024 * 1024);
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(new Response(huge, { status: 200 })),
    });
    await expect(
      fetchSitemapText("https://old.com/sitemap.xml", deps, {
        maxBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toThrow();
  });
});
