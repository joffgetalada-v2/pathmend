import { useState } from "react";
import { useEffect } from "react";
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
  matchPatternRule,
  type PatternRuleError,
} from "../models/patterns";
import {
  createPatternRule,
  deletePatternRule,
  listPatternRules,
  setPatternRuleEnabled,
} from "../models/patterns.server";
import { planHasFeature } from "../models/plans";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { plan } = await getPlanContext(billing);
  const entitled = planHasFeature(plan, "pattern_rules");
  const rules = entitled ? await listPatternRules(session.shop) : [];
  return {
    entitled,
    rules: rules.map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      pattern: rule.pattern,
      target: rule.target,
      enabled: rule.enabled,
      hits: rule.hits,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  // Server-side gate — throws a redirect to the plan page if not entitled.
  await requireFeature(billing, "pattern_rules");
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      const kind = String(formData.get("kind") ?? "");
      if (kind !== "wildcard" && kind !== "regex") {
        return { status: "error" as const, message: "Pick a rule type." };
      }
      return await createPatternRule(shop, {
        kind,
        pattern: String(formData.get("pattern") ?? ""),
        target: String(formData.get("target") ?? ""),
      });
    }

    if (intent === "delete") {
      const id = String(formData.get("id") ?? "");
      if (!id) return { status: "error" as const, message: "Missing rule." };
      await deletePatternRule(shop, id);
      return { status: "deleted" as const };
    }

    if (intent === "toggle") {
      const id = String(formData.get("id") ?? "");
      if (!id) return { status: "error" as const, message: "Missing rule." };
      const enabled = String(formData.get("enabled")) === "true";
      await setPatternRuleEnabled(shop, id, enabled);
      return { status: "toggled" as const, enabled };
    }

    return { status: "error" as const, message: "Unknown action." };
  } catch (thrown) {
    if (thrown instanceof Response) throw thrown;
    console.error("pattern rules action failed", thrown);
    return {
      status: "error" as const,
      message: "Something went wrong. Please try again.",
    };
  }
};

const fieldError = (
  errors: PatternRuleError[] | undefined,
  field: "pattern" | "target",
): string | undefined =>
  errors?.find((error) => error.field === field)?.message;

export default function PatternRulesPage() {
  const { entitled, rules } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [kind, setKind] = useState<"wildcard" | "regex">("wildcard");
  const [pattern, setPattern] = useState("");
  const [target, setTarget] = useState("");
  const [testPath, setTestPath] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  const result = fetcher.data;
  const status = result && "status" in result ? result.status : null;
  const errors =
    result && "errors" in result
      ? (result.errors as PatternRuleError[])
      : undefined;
  const isSubmitting = fetcher.state !== "idle";

  const [lastHandledResult, setLastHandledResult] = useState<typeof result>();
  if (result !== lastHandledResult) {
    setLastHandledResult(result);
    if (status === "created") {
      setPattern("");
      setTarget("");
    }
    if (status === "deleted") {
      setConfirmingDeleteId(null);
    }
  }

  useEffect(() => {
    if (status === "created") shopify.toast.show("Pattern rule saved");
    if (status === "deleted") shopify.toast.show("Pattern rule deleted");
  }, [status, shopify]);

  const readValue = (event: Event) =>
    (event.target as unknown as { value: string }).value;

  const preview =
    testPath.trim() !== "" && pattern.trim() !== ""
      ? matchPatternRule({ kind, pattern, target }, testPath.trim())
      : null;

  if (!entitled) {
    return (
      <s-page heading="Pattern rules & auto-heal">
        <s-section heading="Fix whole families of broken URLs at once">
          <s-paragraph>
            Pattern rules match many old URLs with one wildcard or regex —
            like /blog/* → /news/*. When a visitor hits a new 404 that matches
            a rule, Pathmend automatically creates the real redirect for that
            exact URL. No proxying, no waiting.
          </s-paragraph>
          <s-paragraph>
            Pattern rules and auto-heal are part of the Pro plan.
          </s-paragraph>
          <s-button href="/app/plan" variant="primary">
            View plans
          </s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Pattern rules & auto-heal">
      {status === "error" && result && "message" in result && (
        <s-banner tone="critical" heading="Something went wrong">
          {result.message}
        </s-banner>
      )}

      <s-section heading="Create a rule">
        <s-paragraph>
          When a new 404 matches a rule, Pathmend creates a real Shopify
          redirect for that exact URL automatically and logs it with the rule.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          <s-select
            label="Rule type"
            value={kind}
            onChange={(event: Event) =>
              setKind(readValue(event) === "regex" ? "regex" : "wildcard")
            }
          >
            <s-option value="wildcard">Wildcard (one * captures)</s-option>
            <s-option value="regex">Regular expression</s-option>
          </s-select>
          <s-text-field
            label="Pattern"
            placeholder={kind === "wildcard" ? "/blog/*" : "/p/(\\d+)"}
            value={pattern}
            onInput={(event: Event) => setPattern(readValue(event))}
            {...(fieldError(errors, "pattern")
              ? { error: fieldError(errors, "pattern") }
              : {})}
          ></s-text-field>
          <s-text-field
            label="Redirect to"
            placeholder={kind === "wildcard" ? "/news/*" : "/products/$1"}
            value={target}
            onInput={(event: Event) => setTarget(readValue(event))}
            {...(fieldError(errors, "target")
              ? { error: fieldError(errors, "target") }
              : {})}
          ></s-text-field>
          <s-text-field
            label="Try it against a path (optional)"
            placeholder="/blog/my-old-post"
            value={testPath}
            onInput={(event: Event) => setTestPath(readValue(event))}
            {...(testPath.trim() !== ""
              ? {
                  details: preview
                    ? `Would redirect to ${preview}`
                    : "No match — the whole path must match.",
                }
              : {})}
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() =>
              fetcher.submit(
                { intent: "create", kind, pattern, target },
                { method: "POST" },
              )
            }
            {...(isSubmitting ? { loading: true } : {})}
          >
            Save rule
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Your rules">
        {rules.length === 0 ? (
          <s-paragraph>
            No rules yet. Create one above — it starts healing matching 404s
            immediately.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Type</s-table-header>
              <s-table-header>Pattern</s-table-header>
              <s-table-header>Redirects to</s-table-header>
              <s-table-header>Healed</s-table-header>
              <s-table-header>Active</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-badge>{rule.kind}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{rule.pattern}</s-table-cell>
                  <s-table-cell>{rule.target}</s-table-cell>
                  <s-table-cell>{rule.hits}</s-table-cell>
                  <s-table-cell>
                    <s-switch
                      accessibilityLabel={`Toggle ${rule.pattern}`}
                      {...(rule.enabled ? { checked: true } : {})}
                      onChange={(event) =>
                        fetcher.submit(
                          {
                            intent: "toggle",
                            id: rule.id,
                            enabled: String(
                              (
                                event.currentTarget as unknown as {
                                  checked: boolean;
                                }
                              ).checked,
                            ),
                          },
                          { method: "POST" },
                        )
                      }
                    ></s-switch>
                  </s-table-cell>
                  <s-table-cell>
                    {confirmingDeleteId === rule.id ? (
                      <s-button-group>
                        <s-button
                          variant="primary"
                          tone="critical"
                          {...(isSubmitting ? { loading: true } : {})}
                          onClick={() =>
                            fetcher.submit(
                              { intent: "delete", id: rule.id },
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
                      </s-button-group>
                    ) : (
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => setConfirmingDeleteId(rule.id)}
                      >
                        Delete
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
