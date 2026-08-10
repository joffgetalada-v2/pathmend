import { describe, expect, test } from "vitest";

import {
  SitemapUrlError,
  assertPublicHttpUrl,
  isBlockedHost,
} from "../ssrf.server";

describe("isBlockedHost", () => {
  test("blocks loopback", () => {
    for (const host of ["127.0.0.1", "127.1", "0.0.0.0", "::1", "localhost"]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test("blocks private ranges", () => {
    for (const host of [
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
    ]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test("blocks link-local and cloud metadata", () => {
    for (const host of ["169.254.169.254", "169.254.0.1", "fe80::1"]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test("blocks unique-local IPv6 and IPv4-mapped IPv6", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
    expect(isBlockedHost("fd12:3456::1")).toBe(true);
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedHost("::ffff:10.0.0.1")).toBe(true);
  });

  test("blocks IPv4-mapped/compat IPv6 in every textual form", () => {
    // Proven fetch-to-loopback bypasses: hex-group, compat, and expanded.
    for (const host of [
      "::ffff:7f00:1",
      "::127.0.0.1",
      "0:0:0:0:0:ffff:127.0.0.1",
      "::ffff:a00:1", // 10.0.0.1 as hex groups
    ]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test("blocks CGNAT and the unspecified address", () => {
    expect(isBlockedHost("100.64.0.1")).toBe(true);
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  test("blocks trailing-dot forms of internal hosts", () => {
    expect(isBlockedHost("127.0.0.1.")).toBe(true);
    expect(isBlockedHost("localhost.")).toBe(true);
  });

  test("blocks hosts with no dot (internal names) and .local/.internal", () => {
    expect(isBlockedHost("intranet")).toBe(true);
    expect(isBlockedHost("db.internal")).toBe(true);
    expect(isBlockedHost("printer.local")).toBe(true);
  });

  test("allows ordinary public hostnames", () => {
    for (const host of ["old-site.com", "www.example.co.uk", "shop.myshopify.com"]) {
      expect(isBlockedHost(host)).toBe(false);
    }
  });

  test("allows a public IP literal", () => {
    expect(isBlockedHost("93.184.216.34")).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  test("accepts a normal https URL", () => {
    expect(() =>
      assertPublicHttpUrl("https://old-site.com/sitemap.xml"),
    ).not.toThrow();
  });

  test("rejects non-http(s) schemes", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://old-site.com/x",
      "gopher://old-site.com",
      // eslint-disable-next-line no-script-url
      "javascript:alert(1)",
    ]) {
      expect(() => assertPublicHttpUrl(url)).toThrow();
    }
  });

  test("rejects http (cleartext) to avoid downgrade/SSRF via redirect", () => {
    expect(() => assertPublicHttpUrl("http://old-site.com/x")).toThrow();
  });

  test("rejects blocked hosts", () => {
    for (const url of [
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data/",
      "https://192.168.0.1/x",
      "https://localhost/x",
      "https://[::1]/x",
      "https://[::ffff:7f00:1]/x",
      "https://[::127.0.0.1]/x",
      "https://localhost./x",
    ]) {
      expect(() => assertPublicHttpUrl(url)).toThrow();
    }
  });

  test("rejects embedded credentials", () => {
    expect(() =>
      assertPublicHttpUrl("https://user:pass@old-site.com/x"),
    ).toThrow();
  });

  test("rejects unparseable input", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow();
  });

  test("throws a merchant-safe SitemapUrlError", () => {
    expect(() => assertPublicHttpUrl("http://old-site.com/x")).toThrow(
      SitemapUrlError,
    );
  });
});
