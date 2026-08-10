import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { loadAnalytics } from "../models/analytics.server";
import { getPlanContext } from "../models/billing.server";
import { planHasFeature } from "../models/plans";
import { authenticate } from "../shopify.server";

const WINDOW_DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { plan } = await getPlanContext(billing);
  if (!planHasFeature(plan, "analytics")) {
    return { entitled: false as const };
  }

  const data = await loadAnalytics(session.shop, {
    now: new Date(),
    days: WINDOW_DAYS,
  });
  return { entitled: true as const, ...data };
};

/** Minimal inline bar chart — no external charting dependency. */
function BarChart({ series }: { series: { date: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const width = 640;
  const height = 160;
  const barGap = 2;
  const barWidth = Math.max(1, width / series.length - barGap);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="New 404s per day over the last 30 days"
      style={{ maxWidth: "100%" }}
    >
      {series.map((d, i) => {
        const barHeight = (d.count / max) * (height - 20);
        return (
          <rect
            key={d.date}
            x={i * (barWidth + barGap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            fill="currentColor"
            opacity={0.75}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();

  if (!data.entitled) {
    return (
      <s-page heading="Analytics">
        <s-section heading="See exactly where visitors hit dead ends">
          <s-paragraph>
            Track 404s over time, your most-missed URLs, how many you&apos;ve
            resolved, and the visits you&apos;ve recovered by fixing them.
          </s-paragraph>
          <s-paragraph>Analytics are part of the Pro plan.</s-paragraph>
          <s-button href="/app/plan" variant="primary">
            View plans
          </s-button>
        </s-section>
      </s-page>
    );
  }

  const { summary, series, topPaths, days } = data;
  const resolvedRate =
    summary.totalHits > 0
      ? Math.round((summary.recoveredVisits / summary.totalHits) * 100)
      : 0;

  return (
    <s-page heading="Analytics">
      <s-section heading="Summary">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
          gap="base"
        >
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Unresolved 404s</s-text>
              <s-heading>{summary.statusCounts.unresolved}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Resolved 404s</s-text>
              <s-heading>{summary.statusCounts.resolved}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Redirects created ({days}d)</s-text>
              <s-heading>{summary.redirectsCreated}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text>Recovered visits</s-text>
              <s-heading>{summary.recoveredVisits}</s-heading>
              <s-text tone="neutral">{resolvedRate}% of all 404 hits</s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading={`New 404s over the last ${days} days`}>
        {summary.totalHits === 0 ? (
          <s-paragraph>
            No 404s captured yet. Once the app embed is enabled, broken URLs
            will chart here.
          </s-paragraph>
        ) : (
          <BarChart series={series} />
        )}
      </s-section>

      <s-section heading="Top missing paths">
        {topPaths.length === 0 ? (
          <s-paragraph>No missing paths recorded yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Path</s-table-header>
              <s-table-header>Hits</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {topPaths.map((row) => (
                <s-table-row key={row.path}>
                  <s-table-cell>{row.path}</s-table-cell>
                  <s-table-cell>{row.hits}</s-table-cell>
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
