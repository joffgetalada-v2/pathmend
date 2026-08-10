/**
 * Pattern-rule matching engine (pure, shared by server and UI preview).
 *
 * Rules never serve storefront traffic themselves — a match materializes a
 * concrete native Shopify redirect. Both kinds match the WHOLE path,
 * case-insensitively, mirroring Shopify's redirect matching.
 */

import {
  hasEmbeddedUrl,
  isAbsoluteHttpUrl,
  relativeTargetEscapesOrigin,
} from "./redirects";

export type PatternKind = "wildcard" | "regex";

export interface PatternRuleLike {
  kind: string;
  pattern: string;
  target: string;
}

export interface PatternRuleError {
  field: "pattern" | "target";
  message: string;
}

export const MAX_PATTERN_LENGTH = 200;

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Heuristics against catastrophic backtracking. Merchant regexes run
 * server-side on every captured 404 (attacker-influenced input), so we reject
 * the known-dangerous shapes upfront. Heuristics can't be exhaustive, so
 * matchPatternRule ALSO enforces a wall-clock budget as the real backstop.
 */
// Backreferences force backtracking and aren't needed for URL rules.
const BACKREFERENCE = /\\[1-9]/;
// Cap total quantifiers: many adjacent optional/repeat tokens multiply
// backtracking paths even without one obviously-nested quantifier. URL
// rules never legitimately need this many.
const MAX_QUANTIFIERS = 10;
const QUANTIFIER_AT = /^[*+?]|^\{\d+(,\d*)?\}/;

/**
 * Structural ReDoS guard. A regex can't reliably detect the dangerous shapes
 * across arbitrary nesting (a "[^)]*" scan can't cross nested parens), so
 * walk the pattern with a real paren-balance scan and reject a quantifier
 * applied to a group that is EITHER:
 *   - alternation-bearing: contains "|" anywhere in its subtree — "(a|a)+",
 *     "((a)|(a))+" (alternation-overlap backtracking), OR
 *   - self-quantified: its own last token is already quantified — "(a+)+",
 *     "(.*)*", "(a?){30}" (nested-repetition backtracking).
 * Both are catastrophic; both are invisible to a flat regex. Escaped chars
 * are skipped.
 */
function hasUnsafeQuantifiedGroup(pattern: string): boolean {
  // Per open group: does it contain "|"? did its last token end quantified?
  const stack: { hasAlternation: boolean; endsQuantified: boolean }[] = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "\\") {
      i += 1; // skip the escaped char
      continue;
    }
    if (char === "(") {
      stack.push({ hasAlternation: false, endsQuantified: false });
    } else if (char === "|") {
      if (stack.length > 0) stack[stack.length - 1]!.hasAlternation = true;
    } else if (char === ")") {
      const group = stack.pop();
      if (!group) continue; // unbalanced — RegExp construction will reject
      // A "|" inside this group bubbles up to its parent too.
      if (group.hasAlternation && stack.length > 0) {
        stack[stack.length - 1]!.hasAlternation = true;
      }
      const rest = pattern.slice(i + 1);
      const quantified = QUANTIFIER_AT.test(rest);
      if (quantified && (group.hasAlternation || group.endsQuantified)) {
        return true;
      }
      // This group is now the parent's most-recent token; record whether it
      // ends up quantified so an enclosing quantifier is caught too.
      if (stack.length > 0) {
        stack[stack.length - 1]!.endsQuantified = quantified;
      }
    } else if (QUANTIFIER_AT.test(pattern.slice(i))) {
      // A quantifier on a plain atom marks the current group as ending
      // quantified (until a later token overwrites it).
      if (stack.length > 0) stack[stack.length - 1]!.endsQuantified = true;
    } else if (char !== undefined && !"^$".includes(char)) {
      // A non-quantifier, non-anchor token resets the "last token" state.
      if (stack.length > 0) stack[stack.length - 1]!.endsQuantified = false;
    }
  }
  return false;
}

const countCaptureGroups = (pattern: string): number => {
  // Non-escaped "(" not followed by "?" opens a capturing group.
  const matches = pattern.match(/(^|[^\\])\((?!\?)/g);
  return matches ? matches.length : 0;
};

const isSafeTargetShape = (target: string): boolean => {
  // Absolute http(s) URL is fine; otherwise must be a same-origin path that
  // doesn't escape the origin or visibly embed a URL — same authoritative
  // gate as redirect targets.
  if (isAbsoluteHttpUrl(target)) return true;
  if (!target.startsWith("/")) return false;
  if (relativeTargetEscapesOrigin(target)) return false;
  return !hasEmbeddedUrl(target);
};

export function validatePatternRule(
  input: PatternRuleLike,
): PatternRuleError[] {
  const errors: PatternRuleError[] = [];
  const pattern = input.pattern.trim();
  const target = input.target.trim();

  if (pattern === "" || pattern.length > MAX_PATTERN_LENGTH) {
    errors.push({
      field: "pattern",
      message: `Enter a pattern up to ${MAX_PATTERN_LENGTH} characters.`,
    });
    return errors;
  }

  if (target === "" || !isSafeTargetShape(target)) {
    errors.push({
      field: "target",
      message:
        "The destination must be a path like /collections/all or a full http(s) URL.",
    });
  }

  if (input.kind === "wildcard") {
    if (!pattern.startsWith("/")) {
      errors.push({
        field: "pattern",
        message: "Wildcard patterns must start with / (for example /blog/*).",
      });
    }
    const patternStars = pattern.split("*").length - 1;
    const targetStars = target.split("*").length - 1;
    if (patternStars > 1) {
      errors.push({
        field: "pattern",
        message: "Use at most one * per pattern.",
      });
    }
    if (targetStars > patternStars) {
      errors.push({
        field: "target",
        message: "The destination uses * but the pattern doesn't capture one.",
      });
    }
    return errors;
  }

  // regex
  const quantifierCount = (pattern.match(/[*+?]|\{\d+(,\d*)?\}/g) ?? []).length;
  if (
    hasUnsafeQuantifiedGroup(pattern) ||
    BACKREFERENCE.test(pattern) ||
    quantifierCount > MAX_QUANTIFIERS
  ) {
    errors.push({
      field: "pattern",
      message:
        "This pattern uses repetition or backreferences that can hang matching. Simplify it.",
    });
    return errors;
  }
  try {
    new RegExp(pattern);
  } catch {
    errors.push({
      field: "pattern",
      message: "That isn't a valid regular expression.",
    });
    return errors;
  }
  const groups = countCaptureGroups(pattern);
  const references = [...target.matchAll(/\$([1-9])/g)].map((m) =>
    Number(m[1]),
  );
  const maxReference = references.length > 0 ? Math.max(...references) : 0;
  if (maxReference > groups) {
    errors.push({
      field: "target",
      message: `The destination references $${maxReference} but the pattern only has ${groups} group(s).`,
    });
  }

  return errors;
}

const compileRule = (rule: PatternRuleLike): RegExp | null => {
  try {
    if (rule.kind === "wildcard") {
      const escaped = rule.pattern
        .trim()
        .replace(REGEX_ESCAPE, (char) => (char === "*" ? "(.*)" : `\\${char}`));
      return new RegExp(`^${escaped}$`, "i");
    }
    return new RegExp(`^(?:${rule.pattern.trim()})$`, "i");
  } catch {
    return null;
  }
};

/**
 * Returns the substituted target when the rule matches the whole path,
 * otherwise null. Never throws — bad rules just don't match.
 */
// Legitimate 404 URLs from migrations are short; refuse to run a regex
// against a pathological path. Backstop against any backtracking shape that
// slips past validation — cost scales with input length, so capping it caps
// the worst case regardless of the pattern.
const MAX_MATCH_INPUT_LENGTH = 200;

export function matchPatternRule(
  rule: PatternRuleLike,
  path: string,
): string | null {
  if (path.length > MAX_MATCH_INPUT_LENGTH) return null;
  const compiled = compileRule(rule);
  if (!compiled) return null;
  const match = compiled.exec(path);
  if (!match) return null;

  const target = rule.target.trim();
  const substituted =
    rule.kind === "wildcard"
      ? target.includes("*")
        ? target.replace("*", match[1] ?? "")
        : target
      : target.replace(/\$([1-9])/g, (_, digit) => match[Number(digit)] ?? "");

  // The whole point of a match is materializing this as a native redirect.
  // A visitor-chosen capture must never produce a target that escapes the
  // origin or embeds a URL; drop the match if it would.
  if (
    substituted.startsWith("/") &&
    (relativeTargetEscapesOrigin(substituted) || hasEmbeddedUrl(substituted))
  ) {
    return null;
  }
  return substituted;
}

export interface PatternMatch<Rule extends PatternRuleLike> {
  rule: Rule;
  target: string;
}

/** First enabled matching rule wins; caller controls rule ordering. */
export function firstMatch<Rule extends PatternRuleLike & { enabled: boolean }>(
  rules: readonly Rule[],
  path: string,
): PatternMatch<Rule> | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const target = matchPatternRule(rule, path);
    if (target !== null) {
      return { rule, target };
    }
  }
  return null;
}
