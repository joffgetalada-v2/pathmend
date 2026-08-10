import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getPlanContext, isBillingTest } from "../models/billing.server";
import {
  MIGRATION_PLAN_NAME,
  PLAN_FREE,
  PLANS,
  PRO_PLAN_NAME,
  TRIAL_DAYS,
  type PlanId,
} from "../models/plans";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { plan } = await getPlanContext(billing);
  return { plan };
};

const SUBSCRIBABLE: Record<
  string,
  typeof PRO_PLAN_NAME | typeof MIGRATION_PLAN_NAME
> = {
  pro: PRO_PLAN_NAME,
  migration: MIGRATION_PLAN_NAME,
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "subscribe") {
    const planId = formData.get("planId");
    const subscriptionName =
      typeof planId === "string" ? SUBSCRIBABLE[planId] : undefined;
    if (!subscriptionName) {
      return { error: "Select a valid plan and try again." };
    }
    try {
      // Throws a redirect to Shopify's subscription confirmation page.
      await billing.request({
        plan: subscriptionName,
        isTest: isBillingTest(),
      });
    } catch (thrown) {
      if (thrown instanceof Response) throw thrown;
      console.error("billing.request failed", thrown);
      return { error: "We couldn't start the subscription. Please try again." };
    }
    return null;
  }

  if (intent === "cancel") {
    const { subscription } = await getPlanContext(billing);
    if (!subscription) {
      return { error: "You're already on the Free plan." };
    }
    try {
      await billing.cancel({
        subscriptionId: subscription.id,
        isTest: isBillingTest(),
        prorate: true,
      });
    } catch (thrown) {
      if (thrown instanceof Response) throw thrown;
      console.error("billing.cancel failed", thrown);
      return {
        error: "We couldn't cancel the subscription. Please try again.",
      };
    }
    return { cancelled: true };
  }

  return { error: "Unknown action." };
};

const priceLabel = (monthlyPrice: number) =>
  monthlyPrice === 0 ? "Free" : `$${monthlyPrice}/month`;

export default function PlanPage() {
  const { plan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data && "cancelled" in fetcher.data && fetcher.data.cancelled) {
      shopify.toast.show("You're back on the Free plan");
    }
  }, [fetcher.data, shopify]);

  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const choosePlan = (planId: PlanId) => {
    if (planId === PLAN_FREE) {
      fetcher.submit({ intent: "cancel" }, { method: "POST" });
    } else {
      fetcher.submit({ intent: "subscribe", planId }, { method: "POST" });
    }
  };

  const buttonLabel = (targetId: PlanId, targetName: string) => {
    if (targetId === PLAN_FREE) return "Downgrade to Free";
    if (plan === PLAN_FREE) return `Start ${TRIAL_DAYS}-day free trial`;
    return `Switch to ${targetName}`;
  };

  return (
    <s-page heading="Settings & Plan">
      {error && (
        <s-banner tone="critical" heading="Something went wrong">
          {error}
        </s-banner>
      )}
      <s-section heading="Choose the plan that fits your migration">
        <s-paragraph>
          Every plan detects 404s automatically. Paid plans include a{" "}
          {TRIAL_DAYS}-day free trial, and downgrading never deletes the
          redirects you&apos;ve already created.
        </s-paragraph>
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
          gap="base"
        >
          {PLANS.map((planDefinition) => {
            const isCurrent = planDefinition.id === plan;
            return (
              <s-box
                key={planDefinition.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                {...(isCurrent ? { background: "subdued" } : {})}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-heading>{planDefinition.name}</s-heading>
                    {isCurrent && <s-badge tone="success">Current plan</s-badge>}
                  </s-stack>
                  <s-text>{priceLabel(planDefinition.monthlyPrice)}</s-text>
                  <s-unordered-list>
                    {planDefinition.features.map((feature) => (
                      <s-list-item key={feature}>{feature}</s-list-item>
                    ))}
                  </s-unordered-list>
                  <s-button
                    onClick={() => choosePlan(planDefinition.id)}
                    {...(planDefinition.id === plan || plan !== PLAN_FREE
                      ? {}
                      : { variant: "primary" })}
                    {...(isCurrent || isSubmitting ? { disabled: true } : {})}
                    {...(isSubmitting ? { loading: true } : {})}
                  >
                    {isCurrent
                      ? "Current plan"
                      : buttonLabel(planDefinition.id, planDefinition.name)}
                  </s-button>
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
