import db from "../db.server";
import { activeRedirectLimit, type PlanId } from "./plans";
import {
  normalizePath,
  toSearchQuery,
  validateRedirectInput,
  type RedirectInputError,
} from "./redirects";

/**
 * Redirect CRUD against Shopify's native urlRedirect objects (verified on
 * 2025-10). The live redirect always lives in Shopify — the local Redirect
 * row is a best-effort mirror for caps, search-free counts, and analytics,
 * so mirror failures are logged but never fail the merchant's action.
 *
 * Business outcomes are returned as typed results; transport/GraphQL-level
 * failures throw and should be caught by the route action.
 */

export type RedirectSource =
  | "manual"
  | "not_found_fix"
  | "csv_import"
  | "migration"
  | "auto_heal";

interface AdminClient {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
      tries?: number;
    },
  ) => Promise<Response>;
}

export interface RedirectRecord {
  id: string;
  path: string;
  target: string;
}

export interface ShopifyUserError {
  field?: string[] | null;
  message: string;
}

export type MutationError = RedirectInputError | ShopifyUserError;

export type CreateRedirectResult =
  | { status: "created"; redirect: RedirectRecord }
  | { status: "invalid"; errors: MutationError[] }
  | { status: "limit_reached"; limit: number };

export type UpdateRedirectResult =
  | { status: "updated"; redirect: RedirectRecord }
  | { status: "invalid"; errors: MutationError[] };

export type DeleteRedirectResult =
  | { status: "deleted" }
  | { status: "invalid"; errors: MutationError[] };

export interface RedirectPage {
  redirects: RedirectRecord[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
}

const GRAPHQL_TRIES = 2;
const DEFAULT_PAGE_SIZE = 25;

const CREATE_MUTATION = `#graphql
  mutation PathmendUrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }`;

const UPDATE_MUTATION = `#graphql
  mutation PathmendUrlRedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) {
    urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }`;

const DELETE_MUTATION = `#graphql
  mutation PathmendUrlRedirectDelete($id: ID!) {
    urlRedirectDelete(id: $id) {
      deletedUrlRedirectId
      userErrors { field message }
    }
  }`;

const LIST_QUERY = `#graphql
  query PathmendUrlRedirects($first: Int, $last: Int, $after: String, $before: String, $query: String) {
    urlRedirects(first: $first, last: $last, after: $after, before: $before, query: $query, reverse: true) {
      nodes { id path target }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }`;

async function runGraphql<T>(
  admin: AdminClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, {
    variables,
    tries: GRAPHQL_TRIES,
  });
  const json = (await response.json()) as {
    data?: T;
    errors?: unknown;
  };
  if (!json.data) {
    throw new Error(
      `Shopify GraphQL request failed: ${JSON.stringify(json.errors ?? "no data")}`,
    );
  }
  return json.data;
}

const CHAIN_LOOKUP_QUERY = `#graphql
  query PathmendChainLookup($first: Int, $query: String) {
    urlRedirects(first: $first, query: $query) {
      nodes { id path target }
    }
  }`;

/**
 * A relative target that is itself the source of another redirect chains two
 * 301s (A→B→C): B only exists as a redirect because /b 404s, so every visitor
 * takes the extra hop and link equity dilutes. Shopify accepts the chain
 * silently, so we catch it here. Advisory only — a failed lookup must never
 * block the merchant, so this fails open (null) and logs.
 */
async function findChainedRedirect(
  admin: AdminClient,
  target: string,
): Promise<RedirectRecord | null> {
  if (!target.startsWith("/")) return null; // absolute URLs leave the shop
  const path = normalizePath(target);
  try {
    const data = await runGraphql<{
      urlRedirects: { nodes: RedirectRecord[] };
    }>(admin, CHAIN_LOOKUP_QUERY, { first: 10, query: `"${path}"` });
    return (
      data.urlRedirects.nodes.find((n) => normalizePath(n.path) === path) ??
      null
    );
  } catch (error) {
    console.error("redirect chain lookup failed", error);
    return null;
  }
}

function chainError(chained: RedirectRecord): RedirectInputError {
  return {
    field: "target",
    message: `${chained.path} already redirects to ${chained.target}. Point this redirect straight at ${chained.target} so visitors skip the extra hop.`,
  };
}

/** Mirror writes must never fail the merchant-facing operation. */
async function bestEffortMirror(
  label: string,
  write: () => Promise<unknown>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`redirect mirror write failed (${label})`, error);
  }
}

export async function createRedirect(
  context: { admin: AdminClient; shop: string; plan: PlanId },
  input: { path: string; target: string; source: RedirectSource },
): Promise<CreateRedirectResult> {
  const { admin, shop, plan } = context;

  const errors = validateRedirectInput(input);
  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const limit = activeRedirectLimit(plan);
  if (Number.isFinite(limit)) {
    const count = await db.redirect.count({ where: { shop } });
    if (count >= limit) {
      return { status: "limit_reached", limit };
    }
  }

  const path = normalizePath(input.path);
  const target = input.target.trim();

  const chained = await findChainedRedirect(admin, target);
  if (chained) {
    return { status: "invalid", errors: [chainError(chained)] };
  }

  const data = await runGraphql<{
    urlRedirectCreate: {
      urlRedirect: RedirectRecord | null;
      userErrors: ShopifyUserError[];
    };
  }>(admin, CREATE_MUTATION, { urlRedirect: { path, target } });

  const { urlRedirect, userErrors } = data.urlRedirectCreate;
  if (userErrors.length > 0 || !urlRedirect) {
    return { status: "invalid", errors: userErrors };
  }

  await bestEffortMirror("create", () =>
    db.redirect.upsert({
      where: { shop_path: { shop, path } },
      create: {
        shop,
        shopifyGid: urlRedirect.id,
        path,
        target,
        source: input.source,
      },
      update: { shopifyGid: urlRedirect.id, target, source: input.source },
    }),
  );
  await bestEffortMirror("resolve-404s", () =>
    db.notFoundEvent.updateMany({
      where: { shop, path, status: "unresolved" },
      data: { status: "resolved" },
    }),
  );

  return { status: "created", redirect: urlRedirect };
}

export async function updateRedirect(
  context: { admin: AdminClient; shop: string },
  input: { id: string; path: string; target: string },
): Promise<UpdateRedirectResult> {
  const { admin, shop } = context;

  const errors = validateRedirectInput(input);
  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const path = normalizePath(input.path);
  const target = input.target.trim();

  const chained = await findChainedRedirect(admin, target);
  if (chained && chained.id !== input.id) {
    return { status: "invalid", errors: [chainError(chained)] };
  }

  const data = await runGraphql<{
    urlRedirectUpdate: {
      urlRedirect: RedirectRecord | null;
      userErrors: ShopifyUserError[];
    };
  }>(admin, UPDATE_MUTATION, { id: input.id, urlRedirect: { path, target } });

  const { urlRedirect, userErrors } = data.urlRedirectUpdate;
  if (userErrors.length > 0 || !urlRedirect) {
    return { status: "invalid", errors: userErrors };
  }

  await bestEffortMirror("update", () =>
    db.redirect.updateMany({
      where: { shop, shopifyGid: input.id },
      data: { path, target },
    }),
  );

  return { status: "updated", redirect: urlRedirect };
}

export async function deleteRedirect(
  context: { admin: AdminClient; shop: string },
  id: string,
): Promise<DeleteRedirectResult> {
  const { admin, shop } = context;

  const data = await runGraphql<{
    urlRedirectDelete: {
      deletedUrlRedirectId: string | null;
      userErrors: ShopifyUserError[];
    };
  }>(admin, DELETE_MUTATION, { id });

  const { deletedUrlRedirectId, userErrors } = data.urlRedirectDelete;
  if (userErrors.length > 0 || !deletedUrlRedirectId) {
    return { status: "invalid", errors: userErrors };
  }

  await bestEffortMirror("delete", () =>
    db.redirect.deleteMany({ where: { shop, shopifyGid: id } }),
  );

  return { status: "deleted" };
}

export async function listRedirects(
  admin: AdminClient,
  options: {
    search?: string | null;
    after?: string | null;
    before?: string | null;
    pageSize?: number;
  } = {},
): Promise<RedirectPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const query = toSearchQuery(options.search ?? "");
  // Cursor direction: paging backwards uses last/before, otherwise first/after.
  const variables = options.before
    ? { last: pageSize, before: options.before, query }
    : { first: pageSize, after: options.after ?? null, query };

  const data = await runGraphql<{
    urlRedirects: {
      nodes: RedirectRecord[];
      pageInfo: RedirectPage["pageInfo"];
    };
  }>(admin, LIST_QUERY, variables);

  return {
    redirects: data.urlRedirects.nodes,
    pageInfo: data.urlRedirects.pageInfo,
  };
}

export function countRedirects(shop: string): Promise<number> {
  return db.redirect.count({ where: { shop } });
}

const EXPORT_PAGE_SIZE = 250;
const EXPORT_MAX_ROWS = 10_000;

/**
 * Pages through every redirect on the shop (Shopify is the source of truth,
 * so exports include redirects created outside this app too). Capped so a
 * pathological shop can't hold the request open indefinitely.
 */
export async function fetchAllRedirects(
  admin: AdminClient,
  options: { maxRows?: number } = {},
): Promise<RedirectRecord[]> {
  const maxRows = options.maxRows ?? EXPORT_MAX_ROWS;
  const redirects: RedirectRecord[] = [];
  let after: string | null = null;

  while (redirects.length < maxRows) {
    const page: RedirectPage = await listRedirects(admin, {
      after,
      pageSize: Math.min(EXPORT_PAGE_SIZE, maxRows - redirects.length),
    });
    redirects.push(...page.redirects);
    if (!page.pageInfo.hasNextPage || page.redirects.length === 0) break;
    after = page.pageInfo.endCursor;
  }

  return redirects.slice(0, maxRows);
}
