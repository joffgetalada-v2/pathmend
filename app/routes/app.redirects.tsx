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
import { activeRedirectLimit } from "../models/plans";
import {
  countRedirects,
  createRedirect,
  deleteRedirect,
  listRedirects,
  updateRedirect,
  type MutationError,
} from "../models/redirects.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");

  const [{ plan }, page, count] = await Promise.all([
    getPlanContext(billing),
    listRedirects(admin, { search, after, before }),
    countRedirects(session.shop),
  ]);

  const limit = activeRedirectLimit(plan);
  return {
    redirects: page.redirects,
    pageInfo: page.pageInfo,
    count,
    limit: Number.isFinite(limit) ? limit : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const path = String(formData.get("path") ?? "");
  const target = String(formData.get("target") ?? "");
  const id = String(formData.get("id") ?? "");

  try {
    if (intent === "create") {
      const { plan } = await getPlanContext(billing);
      return await createRedirect(
        { admin, shop, plan },
        { path, target, source: "manual" },
      );
    }
    if (intent === "update" && id) {
      return await updateRedirect({ admin, shop }, { id, path, target });
    }
    if (intent === "delete" && id) {
      return await deleteRedirect({ admin, shop }, id);
    }
    return { status: "error" as const, message: "Unknown action." };
  } catch (error) {
    console.error("redirect action failed", error);
    return {
      status: "error" as const,
      message: "Something went wrong talking to Shopify. Please try again.",
    };
  }
};

const fieldError = (
  errors: MutationError[] | undefined,
  field: "path" | "target",
): string | undefined => {
  const match = errors?.find((error) =>
    Array.isArray(error.field)
      ? error.field[error.field.length - 1] === field
      : error.field === field,
  );
  return match?.message;
};

export default function RedirectsPage() {
  const { redirects, pageInfo, count, limit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();

  const [path, setPath] = useState("");
  const [target, setTarget] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [searchText, setSearchText] = useState(searchParams.get("search") ?? "");

  const isSubmitting = fetcher.state !== "idle";
  const isLoadingPage = navigation.state === "loading";
  const result = fetcher.data;
  const status = result && "status" in result ? result.status : null;
  const errors = result && "errors" in result ? result.errors : undefined;
  const isAtLimit = limit !== null && count >= limit;

  // Reset the form when a submission succeeds. Done during render (the
  // React-endorsed "storing information from previous renders" pattern)
  // instead of an effect, so it can't cascade renders.
  const [lastHandledResult, setLastHandledResult] = useState<typeof result>();
  if (result !== lastHandledResult) {
    setLastHandledResult(result);
    if (status === "created" || status === "updated") {
      setPath("");
      setTarget("");
      setEditingId(null);
    }
    if (status === "deleted") {
      setConfirmingDeleteId(null);
    }
  }

  useEffect(() => {
    if (status === "created") shopify.toast.show("Redirect created");
    if (status === "updated") shopify.toast.show("Redirect updated");
    if (status === "deleted") shopify.toast.show("Redirect deleted");
  }, [status, shopify]);

  const readValue = (event: Event) =>
    (event.target as unknown as { value: string }).value;

  const submitForm = () => {
    fetcher.submit(
      editingId
        ? { intent: "update", id: editingId, path, target }
        : { intent: "create", path, target },
      { method: "POST" },
    );
  };

  const startEditing = (redirect: {
    id: string;
    path: string;
    target: string;
  }) => {
    setEditingId(redirect.id);
    setPath(redirect.path);
    setTarget(redirect.target);
  };

  const applySearch = () => {
    setSearchParams(searchText ? { search: searchText } : {});
  };

  const exportRedirects = async () => {
    // App Bridge patches fetch to attach the session token for app-origin
    // requests, so the resource route can authenticate this download.
    try {
      const response = await fetch("/app/export-redirects");
      if (!response.ok) throw new Error(`export failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "redirects.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("redirect export failed", error);
      shopify.toast.show("Export failed — please try again", {
        isError: true,
      });
    }
  };

  const goToPage = (cursor: string | null, direction: "after" | "before") => {
    if (!cursor) return;
    const params: Record<string, string> = {};
    const search = searchParams.get("search");
    if (search) params.search = search;
    params[direction] = cursor;
    setSearchParams(params);
  };

  return (
    <s-page heading="Redirects">
      {status === "error" && "message" in (result ?? {}) && (
        <s-banner tone="critical" heading="Something went wrong">
          {(result as { message: string }).message}
        </s-banner>
      )}
      {status === "limit_reached" && (
        <s-banner tone="warning" heading="Free plan limit reached">
          You&apos;ve used all {limit} redirects on the Free plan. Upgrade to
          create unlimited redirects — your existing redirects keep working
          either way. <s-link href="/app/plan">View plans</s-link>
        </s-banner>
      )}

      <s-section
        heading={editingId ? "Edit redirect" : "Create a redirect"}
      >
        {limit !== null && !isAtLimit && (
          <s-paragraph>
            {count} of {limit} Free plan redirects used.
          </s-paragraph>
        )}
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Redirect from"
            placeholder="/old-page or a full old-site URL"
            value={path}
            onInput={(event: Event) => setPath(readValue(event))}
            {...(fieldError(errors, "path")
              ? { error: fieldError(errors, "path") }
              : {})}
          ></s-text-field>
          <s-text-field
            label="Redirect to"
            placeholder="/new-page or https://…"
            value={target}
            onInput={(event: Event) => setTarget(readValue(event))}
            {...(fieldError(errors, "target")
              ? { error: fieldError(errors, "target") }
              : {})}
          ></s-text-field>
          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              onClick={submitForm}
              {...(isSubmitting ? { loading: true } : {})}
            >
              {editingId ? "Save changes" : "Create redirect"}
            </s-button>
            {editingId && (
              <s-button
                variant="tertiary"
                onClick={() => {
                  setEditingId(null);
                  setPath("");
                  setTarget("");
                }}
              >
                Cancel
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="All redirects">
        <s-stack direction="inline" gap="base">
          <s-button onClick={exportRedirects}>Export CSV</s-button>
          <s-button href="/app/import" variant="tertiary">
            Import CSV
          </s-button>
          <s-search-field
            label="Search redirects"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search by path or destination"
            value={searchText}
            onInput={(event: Event) => setSearchText(readValue(event))}
          ></s-search-field>
          <s-button onClick={applySearch}>Search</s-button>
        </s-stack>

        {redirects.length === 0 ? (
          <s-paragraph>
            {searchParams.get("search")
              ? "No redirects match your search."
              : "No redirects yet. Create your first one above — or wait for the 404 log to surface broken URLs you can fix in one click."}
          </s-paragraph>
        ) : (
          <s-table
            paginate
            {...(pageInfo.hasNextPage ? { hasNextPage: true } : {})}
            {...(pageInfo.hasPreviousPage ? { hasPreviousPage: true } : {})}
            {...(isLoadingPage ? { loading: true } : {})}
            onNextPage={() => goToPage(pageInfo.endCursor, "after")}
            onPreviousPage={() => goToPage(pageInfo.startCursor, "before")}
          >
            <s-table-header-row>
              <s-table-header>From</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {redirects.map((redirect) => (
                <s-table-row key={redirect.id}>
                  <s-table-cell>{redirect.path}</s-table-cell>
                  <s-table-cell>{redirect.target}</s-table-cell>
                  <s-table-cell>
                    <s-button-group>
                      {confirmingDeleteId === redirect.id ? (
                        <>
                          <s-button
                            variant="primary"
                            tone="critical"
                            {...(isSubmitting ? { loading: true } : {})}
                            onClick={() =>
                              fetcher.submit(
                                { intent: "delete", id: redirect.id },
                                { method: "POST" },
                              )
                            }
                          >
                            Confirm delete
                          </s-button>
                          <s-button
                            variant="tertiary"
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            Cancel
                          </s-button>
                        </>
                      ) : (
                        <>
                          <s-button
                            variant="tertiary"
                            onClick={() => startEditing(redirect)}
                          >
                            Edit
                          </s-button>
                          <s-button
                            variant="tertiary"
                            tone="critical"
                            onClick={() => setConfirmingDeleteId(redirect.id)}
                          >
                            Delete
                          </s-button>
                        </>
                      )}
                    </s-button-group>
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
