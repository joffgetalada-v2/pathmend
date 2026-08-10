import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  listNotFoundEvents,
  notFoundStatusCounts,
} from "../models/not-found.server";
import { countRedirects } from "../models/redirects.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [counts, redirectCount, recent] = await Promise.all([
    notFoundStatusCounts(session.shop),
    countRedirects(session.shop),
    listNotFoundEvents(session.shop, { status: "unresolved", pageSize: 5 }),
  ]);

  return {
    counts,
    redirectCount,
    recent: recent.events.map((event) => ({
      id: event.id,
      path: event.path,
      hits: event.hits,
    })),
  };
};

export default function Dashboard() {
  const { counts, redirectCount, recent } = useLoaderData<typeof loader>();
  const hasAnyData =
    counts.unresolved + counts.resolved + counts.ignored + redirectCount > 0;

  return (
    <s-page heading="Dashboard">
      <s-section heading="At a glance">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
          gap="base"
        >
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Unresolved 404s</s-text>
              <s-heading>{counts.unresolved}</s-heading>
              <s-link href="/app/notfound">Open 404 log</s-link>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Resolved 404s</s-text>
              <s-heading>{counts.resolved}</s-heading>
              <s-link href="/app/notfound?status=resolved">View resolved</s-link>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Redirects created</s-text>
              <s-heading>{redirectCount}</s-heading>
              <s-link href="/app/redirects">Manage redirects</s-link>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {recent.length > 0 ? (
        <s-section heading="Latest unresolved 404s">
          <s-table>
            <s-table-header-row>
              <s-table-header>Path</s-table-header>
              <s-table-header>Hits</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recent.map((event) => (
                <s-table-row key={event.id}>
                  <s-table-cell>{event.path}</s-table-cell>
                  <s-table-cell>{event.hits}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          <s-button href="/app/notfound" variant="primary">
            Fix them in the 404 log
          </s-button>
        </s-section>
      ) : (
        <s-section heading={hasAnyData ? "All caught up" : "Get set up"}>
          <s-paragraph>
            {hasAnyData
              ? "No unresolved 404s right now. New ones will appear here as visitors hit missing pages."
              : "No 404s captured yet. Enable the Pathmend 404 Capture app embed in your theme editor, and broken URLs will start appearing here automatically."}
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
