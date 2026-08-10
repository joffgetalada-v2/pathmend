/**
 * Pure redirect input helpers, shared by server code and UI. GraphQL and
 * database work lives in redirects.server.ts.
 */

export interface RedirectInput {
  path: string;
  target: string;
}

export interface RedirectInputError {
  field: "path" | "target";
  message: string;
}

const ALLOWED_TARGET_PROTOCOLS = ["http:", "https:"];

// A literal embedded scheme (http://, mailto:) or "//" run in a value meant
// to be a same-origin path. This is a tidiness rule — URL-looking paths are
// confusing in the redirect list — NOT the security boundary; that's
// relativeTargetEscapesOrigin below.
const EMBEDDED_URL = /\/\/|[a-z][a-z0-9+.-]*:\/\//i;

/** True when a relative-path target visibly contains a URL. */
export function hasEmbeddedUrl(target: string): boolean {
  return EMBEDDED_URL.test(target);
}

/** True when the target is a well-formed absolute http(s) URL. */
export function isAbsoluteHttpUrl(target: string): boolean {
  try {
    return ALLOWED_TARGET_PROTOCOLS.includes(new URL(target).protocol);
  } catch {
    return false;
  }
}

// Any origin works; .invalid guarantees it never collides with a real host.
const ORIGIN_PROBE = "https://pathmend-target-probe.invalid";

/**
 * The authoritative open-redirect gate: resolve the target as the browser
 * would and reject it if it lands on a different origin. This delegates all
 * of WHATWG's normalization (backslash→slash, tab/newline/CR stripping,
 * protocol-relative handling) to the spec parser instead of a blocklist —
 * closing the whole class of escape tricks at once.
 */
export function relativeTargetEscapesOrigin(target: string): boolean {
  try {
    return new URL(target, `${ORIGIN_PROBE}/`).origin !== ORIGIN_PROBE;
  } catch {
    return true; // unparseable → refuse
  }
}

/**
 * Normalizes a merchant-entered path: trims, unwraps full URLs (merchants
 * paste old-site URLs during migrations), and guarantees a leading slash.
 * Query strings are preserved — Shopify matches them as part of the path.
 */
export function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "/";

  try {
    const url = new URL(trimmed);
    if (ALLOWED_TARGET_PROTOCOLS.includes(url.protocol)) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // Not an absolute URL — treat as a path.
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function validateRedirectInput(
  input: RedirectInput,
): RedirectInputError[] {
  const errors: RedirectInputError[] = [];
  const path = normalizePath(input.path);
  const target = input.target.trim();

  if (input.path.trim() === "") {
    errors.push({ field: "path", message: "Enter the old URL or path." });
  } else if (path === "/") {
    errors.push({
      field: "path",
      message: "The home page can't be redirected.",
    });
  }

  if (target === "") {
    errors.push({
      field: "target",
      message: "Enter where visitors should go instead.",
    });
    return errors;
  }

  // An absolute http(s) URL is always allowed (redirects may point off-site).
  if (!isAbsoluteHttpUrl(target)) {
    // Otherwise it must be a same-origin path. Resolving against a probe
    // origin covers "//host", "/\host", "/<tab>/host" and every other WHATWG
    // escape trick in one spec-compliant check — no blocklist to outgrow.
    if (!target.startsWith("/") || relativeTargetEscapesOrigin(target)) {
      errors.push({
        field: "target",
        message:
          "The destination must be a path like /collections/all or a full http(s) URL.",
      });
      return errors;
    }
    // Same-origin but still URL-shaped (/news/https://evil.com) — reject for
    // clarity, since machine-substituted targets can produce these.
    if (hasEmbeddedUrl(target)) {
      errors.push({
        field: "target",
        message: "The destination path can't contain another URL.",
      });
      return errors;
    }
  }

  // Only relative targets can loop — an absolute URL with the same path may
  // point at a different host (normalizePath would strip the domain).
  if (errors.length === 0 && target.startsWith("/") && normalizePath(target) === path) {
    errors.push({
      field: "target",
      message: "A redirect can't point at itself.",
    });
  }

  return errors;
}

/**
 * Prepares a merchant search term for Shopify's search syntax, where `:`,
 * parentheses, and spaces act as operators. Merchants paste old URLs, so
 * anything non-trivial is quoted to force a literal match.
 */
export function toSearchQuery(term: string): string | null {
  const trimmed = term.trim();
  if (trimmed === "") return null;
  if (/[:()"\\ ]/.test(trimmed)) {
    return `"${trimmed.replace(/(["\\])/g, "\\$1")}"`;
  }
  return trimmed;
}
