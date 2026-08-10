import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { loadWeeklyDigest } from "../models/analytics.server";
import {
  isOnboardingComplete,
  onboardingSteps,
} from "../models/onboarding";
import {
  listNotFoundEvents,
  notFoundStatusCounts,
} from "../models/not-found.server";
import { countRedirects } from "../models/redirects.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [counts, redirectCount, recent, digest] = await Promise.all([
    notFoundStatusCounts(session.shop),
    countRedirects(session.shop),
    listNotFoundEvents(session.shop, { status: "unresolved", pageSize: 5 }),
    loadWeeklyDigest(session.shop, new Date()),
  ]);

  const onboardingState = {
    hasCaptured404:
      counts.unresolved + counts.resolved + counts.ignored > 0,
    hasRedirect: redirectCount > 0,
  };

  return {
    counts,
    redirectCount,
    digest,
    onboarding: isOnboardingComplete(onboardingState)
      ? null
      : onboardingSteps(onboardingState, {
          shop: session.shop,
          // eslint-disable-next-line no-undef
          themeExtensionId: process.env.SHOPIFY_THEME_EXTENSION_ID,
        }),
    recent: recent.events.map((event) => ({
      id: event.id,
      path: event.path,
      hits: event.hits,
    })),
  };
};

export default function Dashboard() {
  const { counts, redirectCount, recent, digest, onboarding } =
    useLoaderData<typeof loader>();
  const hasAnyData =
    counts.unresolved + counts.resolved + counts.ignored + redirectCount > 0;

  return (
    <s-page heading="Dashboard">
      {onboarding && (
        <s-section heading="Get started in 3 steps">
          <s-stack direction="block" gap="base">
            {onboarding.map((step, index) => (
              <s-box
                key={step.key}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                {...(step.done ? { background: "subdued" } : {})}
              >
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="base">
                    <s-badge tone={step.done ? "success" : "neutral"}>
                      {step.done ? "Done" : `Step ${index + 1}`}
                    </s-badge>
                    <s-heading>{step.title}</s-heading>
                  </s-stack>
                  <s-paragraph>{step.description}</s-paragraph>
                  {!step.done && (
                    <s-button href={step.action.href} variant="tertiary">
                      {step.action.label}
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

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

      {digest.hasActivity && (
        <s-section heading="This week">
          <s-paragraph>
            {digest.periodStart} to {digest.periodEnd}
          </s-paragraph>
          <s-stack direction="inline" gap="large">
            <s-stack direction="block" gap="small-200">
              <s-heading>{digest.newNotFound}</s-heading>
              <s-text tone="neutral">new 404s</s-text>
            </s-stack>
            <s-stack direction="block" gap="small-200">
              <s-heading>{digest.redirectsCreated}</s-heading>
              <s-text tone="neutral">redirects created</s-text>
            </s-stack>
            <s-stack direction="block" gap="small-200">
              <s-heading>{digest.recoveredVisits}</s-heading>
              <s-text tone="neutral">recovered visits</s-text>
            </s-stack>
          </s-stack>
          <s-link href="/app/analytics">See full analytics</s-link>
        </s-section>
      )}

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
            Fix these in the 404 log
          </s-button>
        </s-section>
      ) : (
        <s-section heading={hasAnyData ? "All caught up" : "Get set up"}>
          <s-paragraph>
            {hasAnyData
              ? "No unresolved broken links right now. New ones appear here as visitors hit missing pages."
              : "No broken links found yet. Turn on 404 tracking in your theme editor and they'll start appearing here automatically."}
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
