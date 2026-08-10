import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getPlanContext, requireFeature } from "../models/billing.server";
import {
  DEFAULT_MAX_MATCH_URLS,
  parseSitemapUrls,
  type UrlMatch,
} from "../models/migration";
import { matchOldUrls } from "../models/migration.match.server";
import { fetchSitemapText } from "../models/migration.server";
import { planHasFeature } from "../models/plans";
import {
  createRedirect,
  type MutationError,
} from "../models/redirects.server";
import { authenticate } from "../shopify.server";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_APPLY_ROWS = 500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { plan } = await getPlanContext(billing);
  return { entitled: planHasFeature(plan, "migration_import") };
};

/** Pull candidate old paths out of a pasted/uploaded CSV (first column). */
const oldUrlsFromCsv = (csv: string): string[] => {
  const urls: string[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const first = line.split(",")[0]?.trim();
    if (!first) continue;
    if (/^(old_url|url|from|source|path)$/i.test(first)) continue; // header
    urls.push(first.replace(/^"|"$/g, ""));
  }
  return urls;
};

const MAX_CHILD_SITEMAPS = 20;

/**
 * Fetches a sitemap and, if it's a sitemap index, fetches up to
 * MAX_CHILD_SITEMAPS child sitemaps (one level) and returns their content
 * URLs. Every fetch goes through the SSRF-guarded fetchSitemapText — including
 * child locs, since those are attacker-influenced too.
 */
const collectSitemapUrls = async (sitemapUrl: string): Promise<string[]> => {
  const xml = await fetchSitemapText(sitemapUrl);
  const locs = parseSitemapUrls(xml);
  if (!/<sitemapindex[\s>]/i.test(xml)) {
    return locs;
  }
  const urls: string[] = [];
  for (const child of locs.slice(0, MAX_CHILD_SITEMAPS)) {
    try {
      urls.push(...parseSitemapUrls(await fetchSitemapText(child)));
    } catch (error) {
      // One unreachable/blocked child shouldn't sink the whole import.
      console.error("child sitemap fetch failed", error);
    }
  }
  return urls;
};

const parseApplyRows = (
  raw: string,
): { path: string; target: string }[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.length > MAX_APPLY_ROWS ||
      parsed.some(
        (row) =>
          typeof row?.path !== "string" || typeof row?.target !== "string",
      )
    ) {
      return null;
    }
    return parsed.map((row) => ({ path: row.path, target: row.target }));
  } catch {
    return null;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  await requireFeature(billing, "migration_import");
  const shop = session.shop;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_CSV_BYTES + 4096) {
    return { status: "error" as const, message: "That file is too large." };
  }
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "match_csv") {
      const csv = String(formData.get("csv") ?? "");
      const urls = oldUrlsFromCsv(csv);
      if (urls.length === 0) {
        return { status: "error" as const, message: "No URLs found in that file." };
      }
      const matches = await matchOldUrls(admin, urls, {
        maxUrls: DEFAULT_MAX_MATCH_URLS,
      });
      return { status: "matched" as const, matches };
    }

    if (intent === "match_sitemap") {
      const sitemapUrl = String(formData.get("sitemapUrl") ?? "").trim();
      let urls: string[];
      try {
        urls = await collectSitemapUrls(sitemapUrl);
      } catch (error) {
        return {
          status: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "Couldn't fetch that sitemap.",
        };
      }
      if (urls.length === 0) {
        return {
          status: "error" as const,
          message: "No URLs found in that sitemap.",
        };
      }
      const matches = await matchOldUrls(admin, urls, {
        maxUrls: DEFAULT_MAX_MATCH_URLS,
      });
      return { status: "matched" as const, matches };
    }

    if (intent === "apply") {
      const rows = parseApplyRows(String(formData.get("rows") ?? ""));
      if (!rows) {
        return {
          status: "error" as const,
          message: "Nothing valid to apply — run the match again.",
        };
      }
      const { plan } = await getPlanContext(billing);
      let created = 0;
      let limitReached = false;
      const failed: { path: string; errors: MutationError[] }[] = [];
      for (const row of rows) {
        const result = await createRedirect(
          { admin, shop, plan },
          { path: row.path, target: row.target, source: "migration" },
        );
        if (result.status === "created") created += 1;
        else if (result.status === "limit_reached") {
          limitReached = true;
          break;
        } else failed.push({ path: row.path, errors: result.errors });
      }
      return { status: "bulk_done" as const, created, limitReached, failed };
    }

    return { status: "error" as const, message: "Unknown action." };
  } catch (error) {
    console.error("migration action failed", error);
    return {
      status: "error" as const,
      message: "Something went wrong. Please try again.",
    };
  }
};

const CONFIDENCE_TONE: Record<string, "success" | "warning" | "info"> = {
  high: "success",
  medium: "warning",
  low: "info",
};

export default function MigratePage() {
  const { entitled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const result = fetcher.data;
  const status = result && "status" in result ? result.status : null;
  const isSubmitting = fetcher.state !== "idle";
  const matches: UrlMatch[] =
    status === "matched" && result && "matches" in result && result.matches
      ? result.matches
      : [];

  // Default-approve every high/medium match when a match result arrives.
  const [lastMatchResult, setLastMatchResult] = useState<typeof result>();
  if (result !== lastMatchResult) {
    setLastMatchResult(result);
    if (status === "matched") {
      setApproved(
        new Set(
          matches
            .filter((m) => m.target && m.confidence !== "low")
            .map((m) => m.oldUrl),
        ),
      );
    }
  }

  useEffect(() => {
    if (status === "bulk_done" && result && "created" in result) {
      shopify.toast.show(`${result.created} redirect(s) created`);
    }
  }, [status, result, shopify]);

  const readValue = (event: Event) =>
    (event.target as unknown as { value: string }).value;

  const toggle = (oldUrl: string, checked: boolean) =>
    setApproved((current) => {
      const next = new Set(current);
      if (checked) next.add(oldUrl);
      else next.delete(oldUrl);
      return next;
    });

  const applyApproved = () => {
    const rows = matches
      .filter((m) => m.target && approved.has(m.oldUrl))
      .map((m) => ({ path: m.oldUrl, target: m.target as string }));
    if (rows.length === 0) return;
    fetcher.submit(
      { intent: "apply", rows: JSON.stringify(rows) },
      { method: "POST" },
    );
  };

  const uploadCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      fetcher.submit({ intent: "match_csv", csv: text }, { method: "POST" });
    } catch {
      shopify.toast.show("Couldn't read that file", { isError: true });
    }
  };

  if (!entitled) {
    return (
      <s-page heading="Migration importer">
        <s-section heading="Move an entire store's URLs in one pass">
          <s-paragraph>
            Upload your old site&apos;s URLs (or its sitemap) and Pathmend
            matches each one to the right Shopify product, collection, page, or
            blog post — with a confidence score you review before anything is
            created.
          </s-paragraph>
          <s-paragraph>The migration importer is part of the Migration plan.</s-paragraph>
          <s-button href="/app/plan" variant="primary">
            View plans
          </s-button>
        </s-section>
      </s-page>
    );
  }

  const approvedCount = matches.filter(
    (m) => m.target && approved.has(m.oldUrl),
  ).length;

  return (
    <s-page heading="Migration importer">
      {status === "error" && result && "message" in result && (
        <s-banner tone="critical" heading="Something went wrong">
          {result.message}
        </s-banner>
      )}

      <s-section heading="Start from a CSV of old URLs">
        <s-paragraph>
          One old URL per line (the first column). We&apos;ll match each to a
          Shopify page — up to {DEFAULT_MAX_MATCH_URLS} URLs.
        </s-paragraph>
        <input
          type="file"
          accept=".csv,text/csv,.txt"
          onChange={(event) => uploadCsv(event.target.files?.[0])}
        />
      </s-section>

      <s-section heading="Or fetch the old site's sitemap">
        <s-stack direction="inline" gap="base">
          <s-text-field
            label="Sitemap URL"
            placeholder="https://old-site.com/sitemap.xml"
            value={sitemapUrl}
            onInput={(event: Event) => setSitemapUrl(readValue(event))}
          ></s-text-field>
          <s-button
            onClick={() =>
              fetcher.submit(
                { intent: "match_sitemap", sitemapUrl },
                { method: "POST" },
              )
            }
            {...(isSubmitting ? { loading: true } : {})}
          >
            Fetch &amp; match
          </s-button>
        </s-stack>
      </s-section>

      {status === "matched" && (
        <s-section
          heading={`Review ${matches.length} matches (${approvedCount} approved)`}
        >
          {matches.length === 0 ? (
            <s-paragraph>No matches found.</s-paragraph>
          ) : (
            <>
              <s-table>
                <s-table-header-row>
                  <s-table-header>Approve</s-table-header>
                  <s-table-header>Old URL</s-table-header>
                  <s-table-header>Matched to</s-table-header>
                  <s-table-header>Confidence</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {matches.map((match) => (
                    <s-table-row key={match.oldUrl}>
                      <s-table-cell>
                        {match.target ? (
                          <s-checkbox
                            accessibilityLabel={`Approve ${match.oldUrl}`}
                            {...(approved.has(match.oldUrl)
                              ? { checked: true }
                              : {})}
                            onChange={(event) =>
                              toggle(
                                match.oldUrl,
                                (
                                  event.currentTarget as unknown as {
                                    checked: boolean;
                                  }
                                ).checked,
                              )
                            }
                          ></s-checkbox>
                        ) : (
                          "—"
                        )}
                      </s-table-cell>
                      <s-table-cell>{match.oldUrl}</s-table-cell>
                      <s-table-cell>
                        {match.target ? (
                          <>
                            {match.target}
                            {match.title ? ` (${match.title})` : ""}
                          </>
                        ) : (
                          "No match"
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {match.confidence ? (
                          <s-badge tone={CONFIDENCE_TONE[match.confidence]}>
                            {match.confidence}
                          </s-badge>
                        ) : (
                          "—"
                        )}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
              <s-button
                variant="primary"
                onClick={applyApproved}
                {...(isSubmitting || approvedCount === 0
                  ? { disabled: true }
                  : {})}
                {...(isSubmitting ? { loading: true } : {})}
              >
                Create {approvedCount} redirect(s)
              </s-button>
            </>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
