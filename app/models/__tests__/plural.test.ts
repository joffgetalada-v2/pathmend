import { describe, expect, test } from "vitest";

import { capitalize, pluralize } from "../plural";

describe("pluralize", () => {
  test("uses the singular for exactly one", () => {
    expect(pluralize(1, "redirect")).toBe("1 redirect");
  });

  test("appends s for zero and many by default", () => {
    expect(pluralize(0, "redirect")).toBe("0 redirects");
    expect(pluralize(3, "redirect")).toBe("3 redirects");
  });

  test("accepts an explicit plural form", () => {
    expect(pluralize(2, "match", "matches")).toBe("2 matches");
    expect(pluralize(1, "match", "matches")).toBe("1 match");
  });
});

describe("capitalize", () => {
  test("uppercases the first letter", () => {
    expect(capitalize("high")).toBe("High");
    expect(capitalize("wildcard")).toBe("Wildcard");
  });

  test("leaves an empty string alone", () => {
    expect(capitalize("")).toBe("");
  });
});
