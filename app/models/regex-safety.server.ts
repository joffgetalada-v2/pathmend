import { isSafe } from "redos-detector";

/**
 * Server-only ReDoS gate for merchant-authored regex rules. Delegates the
 * backtracking-safety question to redos-detector, which analyzes the pattern's
 * automaton rather than pattern-matching dangerous shapes — three hand-rolled
 * heuristics were each bypassed by a sibling shape (e.g. "(a+a)+", "(.*a)+").
 *
 * Kept out of the shared patterns.ts so the analyzer never reaches the client
 * bundle; the matcher on the hot path stays dependency-free.
 */

// Compile the same way compileRule does so we analyze what actually runs.
const asCompiled = (pattern: string): RegExp =>
  new RegExp(`^(?:${pattern.trim()})$`, "i");

// The analyzer converges fast on real URL patterns; a short budget is enough
// to classify them and bounds the worst case at rule creation. If analysis
// can't finish in time we fail closed (treat as unsafe), so a low timeout is
// safe — it never lets a dangerous pattern through.
const ANALYSIS_TIMEOUT_MS = 250;

export function isRegexPatternSafe(pattern: string): boolean {
  let compiled: RegExp;
  try {
    compiled = asCompiled(pattern);
  } catch {
    return false; // doesn't compile — reject
  }
  try {
    return isSafe(compiled, { timeout: ANALYSIS_TIMEOUT_MS }).safe;
  } catch {
    // Analyzer error (unsupported construct) — fail closed.
    return false;
  }
}
