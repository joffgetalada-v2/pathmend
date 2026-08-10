import {
  DEFAULT_MAX_MATCH_URLS,
  extractSlug,
  scoreMatch,
  type ResourceType,
  type ShopifyResource,
  type UrlMatch,
} from "./migration";

export type { UrlMatch };
export { DEFAULT_MAX_MATCH_URLS };

/**
 * Matches a batch of old-site URLs against the shop's Shopify catalog. For
 * each URL we search products/collections/pages/articles by the URL's slug
 * (as a handle), score the candidates, and return the best guess.
 */

interface AdminClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown>; tries?: number },
  ) => Promise<Response>;
}

const GRAPHQL_TRIES = 2;
const SEARCH_LIMIT = 10;

interface SearchSpec {
  type: ResourceType;
  root: "products" | "collections" | "pages";
  query: string;
}

const SEARCHES: SearchSpec[] = [
  {
    type: "product",
    root: "products",
    query: `#graphql
      query PathmendMatchProducts($query: String!) {
        products(first: ${SEARCH_LIMIT}, query: $query) {
          nodes { id handle title }
        }
      }`,
  },
  {
    type: "collection",
    root: "collections",
    query: `#graphql
      query PathmendMatchCollections($query: String!) {
        collections(first: ${SEARCH_LIMIT}, query: $query) {
          nodes { id handle title }
        }
      }`,
  },
  {
    type: "page",
    root: "pages",
    query: `#graphql
      query PathmendMatchPages($query: String!) {
        pages(first: ${SEARCH_LIMIT}, query: $query) {
          nodes { id handle title }
        }
      }`,
  },
];

async function searchResources(
  admin: AdminClient,
  slug: string,
): Promise<ShopifyResource[]> {
  // Restrict to the handle charset before building the search string so a
  // crafted slug can't inject Shopify search-syntax operators (:, ", *, etc.).
  const safeSlug = slug.replace(/[^a-z0-9-]/g, "");
  if (safeSlug === "") return [];
  // Search by handle and by title so both scoring paths have candidates.
  const searchString = `handle:${safeSlug} OR title:${safeSlug.replace(/-/g, " ")}`;
  const resources: ShopifyResource[] = [];

  for (const spec of SEARCHES) {
    try {
      const response = await admin.graphql(spec.query, {
        variables: { query: searchString },
        tries: GRAPHQL_TRIES,
      });
      const json = (await response.json()) as {
        data?: Record<string, { nodes: { handle: string; title: string }[] }>;
      };
      const nodes = json.data?.[spec.root]?.nodes ?? [];
      for (const node of nodes) {
        resources.push({ type: spec.type, handle: node.handle, title: node.title });
      }
    } catch (error) {
      // One resource type failing shouldn't sink the whole match run.
      console.error(`migration search failed for ${spec.type}`, error);
    }
  }
  return resources;
}

export async function matchOldUrls(
  admin: AdminClient,
  oldUrls: readonly string[],
  options: { maxUrls?: number } = {},
): Promise<UrlMatch[]> {
  const maxUrls = options.maxUrls ?? DEFAULT_MAX_MATCH_URLS;

  const seen = new Set<string>();
  const queue: string[] = [];
  for (const url of oldUrls) {
    if (queue.length >= maxUrls) break;
    const slug = extractSlug(url);
    if (slug === "") continue; // root/empty — nothing to match
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push(url);
  }

  const results: UrlMatch[] = [];
  for (const oldUrl of queue) {
    const slug = extractSlug(oldUrl);
    const candidates = await searchResources(admin, slug);
    const match = scoreMatch(oldUrl, candidates);
    results.push(
      match
        ? {
            oldUrl,
            target: match.target,
            confidence: match.confidence,
            resourceType: match.resource.type,
            title: match.resource.title,
          }
        : { oldUrl, target: null, confidence: null, resourceType: null, title: null },
    );
  }
  return results;
}
