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

  // "//host" looks like a relative path but browsers resolve it to
  // https://host — an open-redirect bypass of the scheme allowlist below.
  if (target.startsWith("//")) {
    errors.push({
      field: "target",
      message:
        "Use a full URL (https://…) to send visitors to another site.",
    });
    return errors;
  }

  if (!target.startsWith("/")) {
    let isValidAbsolute = false;
    try {
      const url = new URL(target);
      isValidAbsolute = ALLOWED_TARGET_PROTOCOLS.includes(url.protocol);
    } catch {
      isValidAbsolute = false;
    }
    if (!isValidAbsolute) {
      errors.push({
        field: "target",
        message:
          "The destination must be a path like /collections/all or a full http(s) URL.",
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
