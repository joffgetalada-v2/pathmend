import { normalizePath } from "./redirects";

/**
 * Pure 404-log definitions shared by server code and UI. Database work lives
 * in not-found.server.ts.
 */

export type NotFoundStatus = "unresolved" | "resolved" | "ignored";

export const NOT_FOUND_STATUSES: readonly NotFoundStatus[] = [
  "unresolved",
  "resolved",
  "ignored",
];

export const NOT_FOUND_PAGE_SIZE = 25;
export const MAX_404_PATH_LENGTH = 1024;

/**
 * Dedupe key for 404 events: lowercased, fragment-stripped, no trailing
 * slash. Returns null for paths we refuse to record (root, over-long).
 */
export function normalize404Path(raw: string): string | null {
  const withoutFragment = raw.split("#")[0] ?? "";
  let path = normalizePath(withoutFragment).toLowerCase();
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path === "/" || path.length > MAX_404_PATH_LENGTH) {
    return null;
  }
  return path;
}
