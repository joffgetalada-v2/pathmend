import { describe, expect, test } from "vitest";

import {
  firstMatch,
  matchPatternRule,
  validatePatternRule,
} from "../patterns";

describe("matchPatternRule — wildcard", () => {
  test("substitutes the wildcard capture into the target", () => {
    const rule = { kind: "wildcard", pattern: "/blog/*", target: "/news/*" };
    expect(matchPatternRule(rule, "/blog/hello-world")).toBe(
      "/news/hello-world",
    );
    expect(matchPatternRule(rule, "/blog/")).toBe("/news/");
  });

  test("supports fixed targets without a wildcard", () => {
    const rule = {
      kind: "wildcard",
      pattern: "/old-shop/*",
      target: "/collections/all",
    };
    expect(matchPatternRule(rule, "/old-shop/anything/here")).toBe(
      "/collections/all",
    );
  });

  test("requires the whole path to match", () => {
    const rule = { kind: "wildcard", pattern: "/blog/*", target: "/news/*" };
    expect(matchPatternRule(rule, "/blogx/post")).toBeNull();
    expect(matchPatternRule(rule, "/blog")).toBeNull();
  });

  test("matches case-insensitively", () => {
    const rule = { kind: "wildcard", pattern: "/Blog/*", target: "/news/*" };
    expect(matchPatternRule(rule, "/blog/Post")).toBe("/news/Post");
  });

  test("escapes regex metacharacters in the pattern", () => {
    const rule = {
      kind: "wildcard",
      pattern: "/docs/v1.0/*",
      target: "/docs/*",
    };
    expect(matchPatternRule(rule, "/docs/v1.0/intro")).toBe("/docs/intro");
    expect(matchPatternRule(rule, "/docs/v1x0/intro")).toBeNull();
  });
});

describe("matchPatternRule — regex", () => {
  test("substitutes numbered groups into the target", () => {
    const rule = {
      kind: "regex",
      pattern: "/p/(\\d+)",
      target: "/products/$1",
    };
    expect(matchPatternRule(rule, "/p/42")).toBe("/products/42");
    expect(matchPatternRule(rule, "/p/42/extra")).toBeNull();
  });

  test("supports reordering multiple groups", () => {
    const rule = {
      kind: "regex",
      pattern: "/(\\d{4})/(\\d{2})/(.+)",
      target: "/blog/$3-$1$2",
    };
    expect(matchPatternRule(rule, "/2023/07/my-post")).toBe(
      "/blog/my-post-202307",
    );
  });

  test("replaces references to missing groups with nothing", () => {
    const rule = { kind: "regex", pattern: "/x/(.+)", target: "/y/$2" };
    expect(matchPatternRule(rule, "/x/abc")).toBe("/y/");
  });

  test("returns null for invalid regex patterns instead of throwing", () => {
    const rule = { kind: "regex", pattern: "/p/(unclosed", target: "/x" };
    expect(matchPatternRule(rule, "/p/1")).toBeNull();
  });
});

describe("matchPatternRule — unsafe capture clamp", () => {
  test("refuses to substitute a capture that would embed a scheme or //", () => {
    // A visitor-chosen path shouldn't be able to produce a URL-in-path target.
    const rule = { kind: "wildcard", pattern: "/blog/*", target: "/news/*" };
    expect(matchPatternRule(rule, "/blog/https://evil.com")).toBeNull();
    expect(matchPatternRule(rule, "/blog//evil.com")).toBeNull();
  });

  test("still substitutes ordinary captures", () => {
    const rule = { kind: "wildcard", pattern: "/blog/*", target: "/news/*" };
    expect(matchPatternRule(rule, "/blog/my-post")).toBe("/news/my-post");
  });
});

describe("firstMatch", () => {
  const rules = [
    {
      id: "a",
      kind: "wildcard",
      pattern: "/a/*",
      target: "/first/*",
      enabled: false,
    },
    {
      id: "b",
      kind: "wildcard",
      pattern: "/a/*",
      target: "/second/*",
      enabled: true,
    },
    {
      id: "c",
      kind: "wildcard",
      pattern: "/a/*",
      target: "/third/*",
      enabled: true,
    },
  ];

  test("returns the first enabled matching rule", () => {
    const match = firstMatch(rules, "/a/x");
    expect(match?.rule.id).toBe("b");
    expect(match?.target).toBe("/second/x");
  });

  test("returns null when nothing matches", () => {
    expect(firstMatch(rules, "/z")).toBeNull();
  });
});

describe("validatePatternRule", () => {
  test("accepts a valid wildcard rule", () => {
    expect(
      validatePatternRule({
        kind: "wildcard",
        pattern: "/blog/*",
        target: "/news/*",
      }),
    ).toEqual([]);
  });

  test("accepts a valid regex rule", () => {
    expect(
      validatePatternRule({
        kind: "regex",
        pattern: "/p/(\\d+)",
        target: "/products/$1",
      }),
    ).toEqual([]);
  });

  test("rejects wildcard patterns without a leading slash or with multiple stars", () => {
    expect(
      validatePatternRule({ kind: "wildcard", pattern: "blog/*", target: "/x" }),
    ).not.toEqual([]);
    expect(
      validatePatternRule({
        kind: "wildcard",
        pattern: "/a/*/b/*",
        target: "/x",
      }),
    ).not.toEqual([]);
  });

  test("rejects a target wildcard when the pattern has none", () => {
    expect(
      validatePatternRule({ kind: "wildcard", pattern: "/a", target: "/b/*" }),
    ).not.toEqual([]);
  });

  test("rejects unsafe targets", () => {
    for (const target of ["//evil.com/*", "javascript:alert(1)", ""]) {
      expect(
        validatePatternRule({ kind: "wildcard", pattern: "/a/*", target }),
      ).not.toEqual([]);
    }
  });

  test("rejects regexes that don't compile", () => {
    const errors = validatePatternRule({
      kind: "regex",
      pattern: "/p/(unclosed",
      target: "/x",
    });
    expect(errors[0]?.field).toBe("pattern");
  });

  test("cheap heuristics reject the obvious backtracking shapes", () => {
    // These are caught by the fast pure heuristics (used for the client
    // preview). The authoritative ReDoS gate is the analyzer in
    // regex-safety.server.ts, exercised via createPatternRule — see
    // patterns.server.test.ts and regex-safety.server.test.ts.
    for (const pattern of [
      "(a+)+",
      "/x/(.*)*",
      "(\\d+){2,}+",
      "(a?){30}(a){30}",
      "(a*){10}",
    ]) {
      const errors = validatePatternRule({
        kind: "regex",
        pattern,
        target: "/x",
      });
      expect(errors.some((e) => e.field === "pattern")).toBe(true);
    }
  });

  test("rejects quantified alternation groups (alternation-overlap ReDoS)", () => {
    // A quantifier applied to any group containing | at ANY nesting depth is
    // the alternation-overlap class — the nested cases bypassed the earlier
    // [^)]* heuristic and backtrack worse than the shallow ones.
    for (const pattern of [
      "(a|a)+",
      "(\\d|\\d\\d)+$",
      "/x/(ab|a)*",
      "((a)|(a))+",
      "((a|b)|(a|c))+",
      "/blog/((a)|(a))+",
      "(((a)|(a))|((a)|(a)))+",
    ]) {
      const errors = validatePatternRule({
        kind: "regex",
        pattern,
        target: "/x",
      });
      expect(errors.some((e) => e.field === "pattern")).toBe(true);
    }
  });

  test("rejects backreferences (backtracking-prone, unneeded for URL rules)", () => {
    const errors = validatePatternRule({
      kind: "regex",
      pattern: "/x/(a)\\1",
      target: "/x",
    });
    expect(errors.some((e) => e.field === "pattern")).toBe(true);
  });

  test("still allows a simple quantified non-alternation group", () => {
    expect(
      validatePatternRule({
        kind: "regex",
        pattern: "/p/(\\d+)/(v\\d)?",
        target: "/products/$1",
      }),
    ).toEqual([]);
  });

  test("rejects patterns with too many quantifiers (backtracking budget)", () => {
    // Many adjacent optional/repeat groups multiply backtracking paths even
    // without a single obviously-nested quantifier.
    const errors = validatePatternRule({
      kind: "regex",
      pattern: "/(a)?(b)?(c)?(d)?(e)?(f)?(g)?(h)?(i)?(j)?(k)?(l)?",
      target: "/x",
    });
    expect(errors.some((e) => e.field === "pattern")).toBe(true);
  });

  test("rejects group references beyond the group count", () => {
    const errors = validatePatternRule({
      kind: "regex",
      pattern: "/p/(\\d+)",
      target: "/x/$2",
    });
    expect(errors.some((e) => e.field === "target")).toBe(true);
  });

  test("rejects over-long patterns", () => {
    const errors = validatePatternRule({
      kind: "regex",
      pattern: `/${"a".repeat(300)}`,
      target: "/x",
    });
    expect(errors).not.toEqual([]);
  });
});
