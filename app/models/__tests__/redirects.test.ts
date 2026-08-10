import { describe, expect, test } from "vitest";

import {
  normalizePath,
  toSearchQuery,
  validateRedirectInput,
} from "../redirects";

describe("normalizePath", () => {
  test("trims whitespace and ensures a leading slash", () => {
    expect(normalizePath("  old-page ")).toBe("/old-page");
    expect(normalizePath("/old-page")).toBe("/old-page");
  });

  test("extracts path and query from a full URL", () => {
    expect(normalizePath("https://old-site.com/blog/post?id=1")).toBe(
      "/blog/post?id=1",
    );
    expect(normalizePath("http://old-site.com/collections/all")).toBe(
      "/collections/all",
    );
  });

  test("preserves query strings on plain paths", () => {
    expect(normalizePath("/search?q=shoes")).toBe("/search?q=shoes");
  });

  test("returns / for empty input", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("   ")).toBe("/");
  });
});

describe("validateRedirectInput", () => {
  test("accepts a relative path and relative target", () => {
    expect(
      validateRedirectInput({ path: "/old", target: "/new" }),
    ).toEqual([]);
  });

  test("accepts an absolute https target", () => {
    expect(
      validateRedirectInput({
        path: "/old",
        target: "https://example.com/new",
      }),
    ).toEqual([]);
  });

  test("rejects an empty path", () => {
    const errors = validateRedirectInput({ path: "   ", target: "/new" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("path");
  });

  test("rejects redirecting the home page", () => {
    const errors = validateRedirectInput({ path: "/", target: "/new" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("path");
  });

  test("rejects an empty target", () => {
    const errors = validateRedirectInput({ path: "/old", target: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("target");
  });

  test("rejects unsafe target schemes", () => {
    for (const target of [
      // eslint-disable-next-line no-script-url
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://example.com/x",
    ]) {
      const errors = validateRedirectInput({ path: "/old", target });
      expect(errors.some((e) => e.field === "target")).toBe(true);
    }
  });

  test("rejects a redirect that points at itself", () => {
    const errors = validateRedirectInput({ path: "/same", target: "/same" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/itself/i);
  });

  test("rejects protocol-relative targets (open-redirect bypass)", () => {
    // "//host" starts with "/" but browsers resolve it to https://host —
    // it must not slip through as a "relative" path.
    for (const target of ["//evil.com", "///evil.com", "//evil.com/path"]) {
      const errors = validateRedirectInput({ path: "/old", target });
      expect(errors.some((e) => e.field === "target")).toBe(true);
    }
  });

  test("allows an absolute target whose path matches the redirect path", () => {
    // Different host — not a loop even though the paths match.
    expect(
      validateRedirectInput({
        path: "/same",
        target: "https://other-site.com/same",
      }),
    ).toEqual([]);
  });
});

describe("toSearchQuery", () => {
  test("passes plain terms through unchanged", () => {
    expect(toSearchQuery("old-page")).toBe("old-page");
  });

  test("returns null for empty input", () => {
    expect(toSearchQuery("")).toBeNull();
    expect(toSearchQuery("   ")).toBeNull();
  });

  test("quotes terms with search-syntax characters for literal matching", () => {
    // Merchants paste old URLs — ":" would otherwise parse as a field filter.
    expect(toSearchQuery("https://old.com/x")).toBe('"https://old.com/x"');
    expect(toSearchQuery("two words")).toBe('"two words"');
  });

  test("escapes embedded quotes and backslashes", () => {
    expect(toSearchQuery('say "hi"')).toBe('"say \\"hi\\""');
    expect(toSearchQuery("back\\slash")).toBe('"back\\\\slash"');
  });
});
