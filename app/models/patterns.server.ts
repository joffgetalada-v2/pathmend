import db from "../db.server";
import { getPlanViaAdmin } from "./billing.server";
import {
  firstMatch,
  validatePatternRule,
  type PatternRuleError,
  type PatternRuleLike,
} from "./patterns";
import { planHasFeature } from "./plans";
import { isRegexPatternSafe } from "./regex-safety.server";
import { createRedirect } from "./redirects.server";

interface AdminClient {
  graphql: (query: string, options?: object) => Promise<Response>;
}

export type CreatePatternRuleResult =
  | { status: "created"; rule: { id: string } }
  | { status: "invalid"; errors: PatternRuleError[] };

export async function listPatternRules(shop: string) {
  return db.patternRule.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });
}

export async function createPatternRule(
  shop: string,
  input: PatternRuleLike,
): Promise<CreatePatternRuleResult> {
  const errors = validatePatternRule(input);
  if (errors.length > 0) {
    return { status: "invalid", errors };
  }
  // Authoritative ReDoS gate (analyzer, not shape heuristics). Runs only for
  // regex rules — wildcard rules compile to a single bounded (.*).
  if (input.kind === "regex" && !isRegexPatternSafe(input.pattern)) {
    return {
      status: "invalid",
      errors: [
        {
          field: "pattern",
          message:
            "This pattern can cause catastrophic backtracking. Simplify it (avoid nested or overlapping repetition).",
        },
      ],
    };
  }
  const rule = await db.patternRule.create({
    data: {
      shop,
      kind: input.kind,
      pattern: input.pattern.trim(),
      target: input.target.trim(),
    },
  });
  return { status: "created", rule };
}

export async function deletePatternRule(
  shop: string,
  id: string,
): Promise<number> {
  const { count } = await db.patternRule.deleteMany({ where: { shop, id } });
  return count;
}

export async function setPatternRuleEnabled(
  shop: string,
  id: string,
  enabled: boolean,
): Promise<number> {
  const { count } = await db.patternRule.updateMany({
    where: { shop, id },
    data: { enabled },
  });
  return count;
}

export type AutoHealOutcome =
  | "healed"
  | "no_rules"
  | "no_match"
  | "not_entitled"
  | "failed";

/**
 * Auto-heal: when a captured 404 matches a saved pattern, materialize a
 * concrete native redirect. Ordered to keep the hot path cheap — the plan
 * lookup (an extra GraphQL call) only happens once a rule actually matched.
 * createRedirect marks the originating 404 event resolved as a side effect.
 */
export async function autoHealNotFound(
  admin: AdminClient,
  shop: string,
  path: string,
): Promise<AutoHealOutcome> {
  const rules = await db.patternRule.findMany({
    where: { shop, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (rules.length === 0) return "no_rules";

  const match = firstMatch(rules, path);
  if (!match) return "no_match";

  const plan = await getPlanViaAdmin(admin);
  if (!planHasFeature(plan, "pattern_rules")) return "not_entitled";

  const result = await createRedirect(
    { admin, shop, plan },
    { path, target: match.target, source: "auto_heal" },
  );
  if (result.status !== "created") return "failed";

  try {
    await db.patternRule.update({
      where: { id: match.rule.id },
      data: { hits: { increment: 1 }, lastMatchedAt: new Date() },
    });
  } catch (error) {
    // Best-effort stats — the redirect itself already exists.
    console.error("pattern rule stats update failed", error);
  }
  return "healed";
}
