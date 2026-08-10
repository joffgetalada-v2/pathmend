import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getPlanContext } from "../models/billing.server";
import {
  NOT_FOUND_STATUSES,
  type NotFoundStatus,
} from "../models/not-found";
import {
  listNotFoundEvents,
  notFoundStatusCounts,
  setNotFoundStatus,
} from "../models/not-found.server";
import {
  createRedirect,
  type MutationError,
} from "../models/redirects.server";
import { authenticate } from "../shopify.server";

const MAX_BULK_FIX = 50;

const referrerHost = (referrer: string | null): string | null => {
  if (!referrer) return null;
  try {
    return new URL(referrer).host;
  } catch {
    return referrer.slice(0, 40);
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status: NotFoundStatus = NOT_FOUND_STATUSES.includes(
    statusParam as NotFoundStatus,
  )
    ? (statusParam as NotFoundStatus)
    : "unresolved";
  const search = url.searchParams.get("search") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1") || 1;

  const [pageData, counts] = await Promise.all([
    listNotFoundEvents(session.shop, { status, search, page }),
    notFoundStatusCounts(session.shop),
  ]);

  return {
    status,
    counts,
    total: pageData.total,
    page: pageData.page,
    pageSize: pageData.pageSize,
    events: pageData.events.map((event) => ({
      id: event.id,
      path: event.path,
      hits: event.hits,
      deviceType: event.deviceType,
      referrerHost: referrerHost(event.referrer),
      lastSeenDate: event.lastSeenAt.toISOString().slice(0, 10),
    })),
  };
};

const parseStringArray = (raw: string, maxLength: number): string[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.length > maxLength ||
      parsed.some((item) => typeof item !== "string")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "fix") {
      const path = String(formData.get("path") ?? "");
      const target = String(formData.get("target") ?? "");
      const { plan } = await getPlanContext(billing);
      return await createRedirect(
        { admin, shop, plan },
        { path, target, source: "not_found_fix" },
      );
    }

    if (intent === "bulk_fix") {
      const paths = parseStringArray(
        String(formData.get("paths") ?? ""),
        MAX_BULK_FIX,
      );
      const target = String(formData.get("target") ?? "");
      if (!paths) {
        return {
          status: "error" as const,
          message: `Select 1–${MAX_BULK_FIX} paths to fix.`,
        };
      }
      const { plan } = await getPlanContext(billing);
      let created = 0;
      let limitReached = false;
      const failed: { path: string; errors: MutationError[] }[] = [];
      for (const path of paths) {
        const result = await createRedirect(
          { admin, shop, plan },
          { path, target, source: "not_found_fix" },
        );
        if (result.status === "created") {
          created += 1;
        } else if (result.status === "limit_reached") {
          limitReached = true;
          break;
        } else {
          failed.push({ path, errors: result.errors });
        }
      }
      return { status: "bulk_done" as const, created, limitReached, failed };
    }

    if (intent === "ignore" || intent === "unignore") {
      const ids = parseStringArray(String(formData.get("ids") ?? ""), 250);
      if (!ids) {
        return { status: "error" as const, message: "Select rows first." };
      }
      const count = await setNotFoundStatus(
        shop,
        ids,
        intent === "ignore" ? "ignored" : "unresolved",
      );
      return { status: "status_updated" as const, count, intent };
    }

    return { status: "error" as const, message: "Unknown action." };
  } catch (error) {
    console.error("404 log action failed", error);
    return {
      status: "error" as const,
      message: "Something went wrong. Please try again.",
    };
  }
};

const TAB_LABELS: Record<NotFoundStatus, string> = {
  unresolved: "Unresolved",
  ignored: "Ignored",
  resolved: "Resolved",
};

export default function NotFoundLogPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fixPaths, setFixPaths] = useState<string[] | null>(null);
  const [target, setTarget] = useState("");
  const [searchText, setSearchText] = useState(searchParams.get("search") ?? "");

  const result = fetcher.data;
  const status = result && "status" in result ? result.status : null;
  const bulkFailed =
    result && "failed" in result && Array.isArray(result.failed)
      ? result.failed
      : [];
  const isSubmitting = fetcher.state !== "idle";

  // Clear row state when the tab changes or a mutation succeeds (render-time
  // adjustment — see the redirects page for the pattern rationale).
  const [prevTab, setPrevTab] = useState(data.status);
  if (prevTab !== data.status) {
    setPrevTab(data.status);
    setSelectedIds([]);
    setFixPaths(null);
  }
  const [lastHandledResult, setLastHandledResult] = useState<typeof result>();
  if (result !== lastHandledResult) {
    setLastHandledResult(result);
    if (status === "created" || status === "status_updated") {
      setSelectedIds([]);
      setFixPaths(null);
      setTarget("");
    }
    if (status === "bulk_done") {
      setSelectedIds([]);
      // Keep the failed paths armed so the merchant can retry them with a
      // corrected target instead of re-selecting rows.
      const failedPaths = bulkFailed.map((failure) => failure.path);
      setFixPaths(failedPaths.length > 0 ? failedPaths : null);
      if (failedPaths.length === 0) setTarget("");
    }
  }

  useEffect(() => {
    if (!result) return;
    if (status === "created") shopify.toast.show("Redirect created");
    if (status === "bulk_done" && "created" in result) {
      shopify.toast.show(
        bulkFailed.length > 0
          ? `${result.created} created, ${bulkFailed.length} failed`
          : `${result.created} redirect(s) created`,
      );
    }
    if (status === "status_updated" && "count" in result) {
      shopify.toast.show(
        `${result.count} item(s) ${"intent" in result && result.intent === "ignore" ? "ignored" : "restored"}`,
      );
    }
  }, [result, status, shopify]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params);
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const submitFix = () => {
    if (!fixPaths || fixPaths.length === 0) return;
    if (fixPaths.length === 1) {
      fetcher.submit(
        { intent: "fix", path: fixPaths[0]!, target },
        { method: "POST" },
      );
    } else {
      fetcher.submit(
        { intent: "bulk_fix", paths: JSON.stringify(fixPaths), target },
        { method: "POST" },
      );
    }
  };

  const submitStatusChange = (intent: "ignore" | "unignore") => {
    fetcher.submit(
      { intent, ids: JSON.stringify(selectedIds) },
      { method: "POST" },
    );
  };

  const errorMessage =
    result && "message" in result && status === "error" ? result.message : null;
  const fieldErrors =
    result && "errors" in result ? (result.errors as MutationError[]) : undefined;
  const isLimitReached =
    status === "limit_reached" ||
    (status === "bulk_done" &&
      result &&
      "limitReached" in result &&
      result.limitReached);
  const hasNextPage = data.page * data.pageSize < data.total;
  const selectedPaths = data.events
    .filter((event) => selectedIds.includes(event.id))
    .map((event) => event.path);

  return (
    <s-page heading="404 Log">
      {errorMessage && (
        <s-banner tone="critical" heading="Something went wrong">
          {errorMessage}
        </s-banner>
      )}
      {status === "bulk_done" && bulkFailed.length > 0 && (
        <s-banner tone="warning" heading="Some redirects weren't created">
          <s-unordered-list>
            {bulkFailed.map((failure) => (
              <s-list-item key={failure.path}>
                {failure.path} — {failure.errors[0]?.message ?? "invalid"}
              </s-list-item>
            ))}
          </s-unordered-list>
          Fix the destination below and try again.
        </s-banner>
      )}
      {isLimitReached && (
        <s-banner tone="warning" heading="Free plan limit reached">
          You&apos;ve hit the Free plan&apos;s redirect limit, so some fixes
          weren&apos;t created. Upgrade for unlimited redirects.{" "}
          <s-link href="/app/plan">View plans</s-link>
        </s-banner>
      )}

      {fixPaths && (
        <s-section
          heading={
            fixPaths.length === 1
              ? `Redirect ${fixPaths[0]}`
              : `Redirect ${fixPaths.length} paths to one destination`
          }
        >
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Redirect to"
              placeholder="/new-page or https://…"
              value={target}
              onInput={(event: Event) =>
                setTarget((event.target as unknown as { value: string }).value)
              }
              {...(fieldErrors?.length
                ? { error: fieldErrors[0]!.message }
                : {})}
            ></s-text-field>
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={submitFix}
                {...(isSubmitting ? { loading: true } : {})}
              >
                {fixPaths.length === 1
                  ? "Create redirect"
                  : `Create ${fixPaths.length} redirects`}
              </s-button>
              <s-button variant="tertiary" onClick={() => setFixPaths(null)}>
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          {NOT_FOUND_STATUSES.map((tab) => (
            <s-button
              key={tab}
              {...(tab === data.status ? {} : { variant: "tertiary" })}
              onClick={() => updateParams({ status: tab, page: null })}
            >
              {`${TAB_LABELS[tab]} (${data.counts[tab]})`}
            </s-button>
          ))}
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-search-field
            label="Search 404 paths"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search by path"
            value={searchText}
            onInput={(event: Event) =>
              setSearchText(
                (event.target as unknown as { value: string }).value,
              )
            }
          ></s-search-field>
          <s-button
            onClick={() =>
              updateParams({ search: searchText || null, page: null })
            }
          >
            Search
          </s-button>
        </s-stack>

        {selectedIds.length > 0 && (
          <s-stack direction="inline" gap="base">
            <s-text>{selectedIds.length} selected</s-text>
            {data.status === "unresolved" && (
              <s-button onClick={() => setFixPaths(selectedPaths)}>
                Fix selected
              </s-button>
            )}
            {data.status === "ignored" ? (
              <s-button onClick={() => submitStatusChange("unignore")}>
                Restore selected
              </s-button>
            ) : (
              <s-button onClick={() => submitStatusChange("ignore")}>
                Ignore selected
              </s-button>
            )}
          </s-stack>
        )}

        {data.events.length === 0 ? (
          <s-paragraph>
            {data.status === "unresolved"
              ? "No unresolved 404s — either your store is healthy or the capture embed isn't enabled yet."
              : `No ${data.status} 404s.`}
          </s-paragraph>
        ) : (
          <s-table
            paginate
            {...(hasNextPage ? { hasNextPage: true } : {})}
            {...(data.page > 1 ? { hasPreviousPage: true } : {})}
            {...(navigation.state === "loading" ? { loading: true } : {})}
            onNextPage={() => updateParams({ page: String(data.page + 1) })}
            onPreviousPage={() => updateParams({ page: String(data.page - 1) })}
          >
            <s-table-header-row>
              <s-table-header></s-table-header>
              <s-table-header>Path</s-table-header>
              <s-table-header>Hits</s-table-header>
              <s-table-header>Last seen</s-table-header>
              <s-table-header>Referrer</s-table-header>
              <s-table-header>Device</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.events.map((event) => (
                <s-table-row key={event.id}>
                  <s-table-cell>
                    <s-checkbox
                      accessibilityLabel={`Select ${event.path}`}
                      {...(selectedIds.includes(event.id)
                        ? { checked: true }
                        : {})}
                      onChange={(changeEvent) =>
                        toggleRow(
                          event.id,
                          (
                            changeEvent.currentTarget as unknown as {
                              checked: boolean;
                            }
                          ).checked,
                        )
                      }
                    ></s-checkbox>
                  </s-table-cell>
                  <s-table-cell>{event.path}</s-table-cell>
                  <s-table-cell>{event.hits}</s-table-cell>
                  <s-table-cell>{event.lastSeenDate}</s-table-cell>
                  <s-table-cell>{event.referrerHost ?? "—"}</s-table-cell>
                  <s-table-cell>{event.deviceType}</s-table-cell>
                  <s-table-cell>
                    {data.status === "unresolved" && (
                      <s-button
                        variant="tertiary"
                        onClick={() => setFixPaths([event.path])}
                      >
                        Fix
                      </s-button>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
