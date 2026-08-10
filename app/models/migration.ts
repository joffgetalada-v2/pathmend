/**
 * Pure migration-matching logic: turn an old-site URL into a best-guess
 * Shopify target with a confidence score. Shopify GraphQL search and the
 * SSRF-guarded sitemap fetch live in migration.server.ts.
 */

export type ResourceType = "product" | "collection" | "page" | "article";

export interface ShopifyResource {
  type: ResourceType;
  handle: string;
  title: string;
  /** Only for articles — the parent blog's handle. */
  blogHandle?: string;
}

export type Confidence = "high" | "medium" | "low";

export interface MatchResult {
  resource: ShopifyResource;
  target: string;
  confidence: Confidence;
}

export const DEFAULT_MAX_SITEMAP_URLS = 2000;
export const DEFAULT_MAX_MATCH_URLS = 500;

/** Result of matching one old URL — shared shape for server and UI. */
export interface UrlMatch {
  oldUrl: string;
  target: string | null;
  confidence: Confidence | null;
  resourceType: ResourceType | null;
  title: string | null;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Lowercase a-z0-9 tokens from a string, e.g. "Blue Shirt!" → ["blue","shirt"]. */
const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const slugify = (value: string): string => tokenize(value).join("-");

/**
 * The last meaningful path segment of an old URL, lowercased, with any file
 * extension, query, and fragment removed. This is what we match against.
 */
export function extractSlug(rawUrl: string): string {
  let path = rawUrl.trim();
  try {
    const url = new URL(path);
    path = url.pathname;
  } catch {
    path = path.split("#")[0]!.split("?")[0]!;
  }
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return last.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

const PATH_PREFIX: Record<ResourceType, string> = {
  product: "/products/",
  collection: "/collections/",
  page: "/pages/",
  article: "/blogs/",
};

export function resourcePath(resource: ShopifyResource): string {
  if (resource.type === "article") {
    return `/blogs/${resource.blogHandle ?? "news"}/${resource.handle}`;
  }
  return `${PATH_PREFIX[resource.type]}${resource.handle}`;
}

const scoreResource = (
  slug: string,
  slugTokens: string[],
  resource: ShopifyResource,
): Confidence | null => {
  const handle = resource.handle.toLowerCase();
  if (handle === slug) return "high";

  const titleSlug = slugify(resource.title);
  if (titleSlug === slug) return "medium";

  // Token overlap: how much of the old slug's words appear in the handle.
  const handleTokens = new Set(tokenize(resource.handle));
  if (slugTokens.length === 0) return null;
  const overlap = slugTokens.filter((t) => handleTokens.has(t)).length;
  const ratio = overlap / slugTokens.length;
  if (ratio >= 0.5) return "low";
  return null;
};

/**
 * Best match for one old URL among candidate resources, or null. Highest
 * confidence wins; ties keep the first candidate.
 */
export function scoreMatch(
  oldUrl: string,
  candidates: readonly ShopifyResource[],
): MatchResult | null {
  const slug = extractSlug(oldUrl);
  if (slug === "") return null;
  const slugTokens = tokenize(slug);

  let best: MatchResult | null = null;
  for (const resource of candidates) {
    const confidence = scoreResource(slug, slugTokens, resource);
    if (confidence === null) continue;
    if (
      best === null ||
      CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[best.confidence]
    ) {
      best = { resource, target: resourcePath(resource), confidence };
    }
  }
  return best;
}

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Extracts <loc> URLs from a sitemap or sitemapindex. Deliberately a simple
 * regex scan (not a full XML parser) — sitemaps are flat and we only need the
 * loc values; keeps the dependency surface minimal.
 */
export function parseSitemapUrls(
  xml: string,
  options: { maxUrls?: number } = {},
): string[] {
  const maxUrls = options.maxUrls ?? DEFAULT_MAX_SITEMAP_URLS;
  const urls: string[] = [];
  const locPattern = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locPattern.exec(xml)) !== null && urls.length < maxUrls) {
    const value = decodeXmlEntities(match[1]!.trim());
    if (value !== "") urls.push(value);
  }
  return urls;
}
