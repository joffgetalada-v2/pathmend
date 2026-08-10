import { describe, expect, test } from "vitest";

import { isRegexPatternSafe } from "../regex-safety.server";

describe("isRegexPatternSafe", () => {
  // One case per pattern: an unsafe pattern can consume the full analysis
  // budget, so batching several in one test() risks the vitest timeout.
  const UNSAFE = [
    "(a+)+",
    "(a?){30}(a){30}",
    "(a|a)+",
    "((a)|(a))+",
    "(.*)*",
    // The shapes that bypassed the hand-rolled scanner.
    "(a+a)+",
    "(.*a)+",
    "([a-z]+[a-z]+)+",
  ];
  test.each(UNSAFE)("flags %s as unsafe", (pattern) => {
    expect(isRegexPatternSafe(pattern)).toBe(false);
  });

  const SAFE = [
    "/p/(\\d+)",
    "/blog/([a-z-]+)",
    "/p/(a|b)",
    "/(x)?(y)?",
    "/(en|fr|de)/products/(.+)",
    "/items/([0-9]{1,5})",
    "/(shop)?/products/([a-z-]+)",
    "/p/(\\d+)/(v\\d)?",
  ];
  test.each(SAFE)("passes %s", (pattern) => {
    expect(isRegexPatternSafe(pattern)).toBe(true);
  });

  test("treats an unparseable pattern as unsafe", () => {
    expect(isRegexPatternSafe("(unclosed")).toBe(false);
  });
});
