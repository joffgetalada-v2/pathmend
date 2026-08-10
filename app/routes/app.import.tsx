import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getPlanContext } from "../models/billing.server";
import { DEFAULT_MAX_CSV_ROWS, parseRedirectCsv } from "../models/csv";
import { activeRedirectLimit } from "../models/plans";
import {
  countRedirects,
  createRedirect,
  type MutationError,
} from "../models/redirects.server";
import { authenticate } from "../shopify.server";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const [{ plan }, count] = await Promise.all([
    getPlanContext(billing),
    countRedirects(session.shop),
  ]);
  const limit = activeRedirectLimit(plan);
  return { count, limit: Number.isFinite(limit) ? limit : null };
};

const parseRows = (
  raw: string,
): { path: string; target: string }[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.length > DEFAULT_MAX_CSV_ROWS ||
      parsed.some(
        (row) =>
          typeof row !== "object" ||
          row === null ||
          typeof row.path !== "string" ||
          typeof row.target !== "string",
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
  const shop = session.shop;

  // Gate on Content-Length BEFORE request.formData() buffers the whole body —
  // the 2MB csv-field check alone would run after the memory is already spent.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_CSV_BYTES + 4096) {
    return {
      status: "error" as const,
      message: "That file is too large — the limit is 2MB.",
    };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "preview") {
      const csv = String(formData.get("csv") ?? "");
      if (csv.length > MAX_CSV_BYTES) {
        return {
          status: "error" as const,
          message: "That file is too large — the limit is 2MB.",
        };
      }
      const { rows, errors } = parseRedirectCsv(csv);
      return { status: "preview" as const, rows, errors };
    }

    if (intent === "apply") {
      const rows = parseRows(String(formData.get("rows") ?? ""));
      if (!rows) {
        return {
          status: "error" as const,
          message:
            "No valid rows found. Check each row has an old URL and a destination, then try again.",
        };
      }
      const { plan } = await getPlanContext(billing);
      let created = 0;
      let limitReached = false;
      const failed: { path: string; errors: MutationError[] }[] = [];
      for (const row of rows) {
        const result = await createRedirect(
          { admin, shop, plan },
          { path: row.path, target: row.target, source: "csv_import" },
        );
        if (result.status === "created") {
          created += 1;
        } else if (result.status === "limit_reached") {
          limitReached = true;
          break;
        } else {
          failed.push({ path: row.path, errors: result.errors });
        }
      }
      return { status: "bulk_done" as const, created, limitReached, failed };
    }

    return { status: "error" as const, message: "Unknown action." };
  } catch (error) {
    console.error("import action failed", error);
    return {
      status: "error" as const,
      message: "Something went wrong. Please try again.",
    };
  }
};

export default function ImportPage() {
  const { count, limit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const result = fetcher.data;
  const status = result && "status" in result ? result.status : null;
  const isSubmitting = fetcher.state !== "idle";
  const previewRows =
    status === "preview" && result && "rows" in result && Array.isArray(result.rows)
      ? result.rows
      : [];
  const previewErrors =
    status === "preview" &&
    result &&
    "errors" in result &&
    Array.isArray(result.errors)
      ? result.errors
      : [];
  const bulkFailed =
    result && "failed" in result && Array.isArray(result.failed)
      ? result.failed
      : [];

  useEffect(() => {
    if (status === "bulk_done" && result && "created" in result) {
      shopify.toast.show(
        bulkFailed.length > 0
          ? `${result.created} imported, ${bulkFailed.length} failed`
          : `${result.created} redirect(s) imported`,
      );
    }
  }, [status, result, bulkFailed, shopify]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      fetcher.submit({ intent: "preview", csv: text }, { method: "POST" });
    } catch (error) {
      console.error("csv file read failed", error);
      shopify.toast.show("Couldn't read that file — please try again", {
        isError: true,
      });
    }
  };

  const applyImport = () => {
    fetcher.submit(
      {
        intent: "apply",
        rows: JSON.stringify(
          previewRows.map((row) => ({ path: row.path, target: row.target })),
        ),
      },
      { method: "POST" },
    );
  };

  const errorMessage =
    status === "error" && result && "message" in result ? result.message : null;
  const isLimitReached =
    status === "bulk_done" &&
    result &&
    "limitReached" in result &&
    result.limitReached;

  return (
    <s-page heading="Import redirects">
      {errorMessage && (
        <s-banner tone="critical" heading="Import failed">
          {errorMessage}
        </s-banner>
      )}
      {isLimitReached && (
        <s-banner tone="warning" heading="Free plan limit reached">
          The import stopped at your plan&apos;s redirect limit. Upgrade for
          unlimited redirects, then run the import again — already-imported
          rows are skipped as duplicates.{" "}
          <s-link href="/app/plan">View plans</s-link>
        </s-banner>
      )}
      {status === "bulk_done" && bulkFailed.length > 0 && (
        <s-banner tone="warning" heading="Some rows weren't imported">
          <s-unordered-list>
            {bulkFailed.slice(0, 10).map((failure) => (
              <s-list-item key={failure.path}>
                {failure.path} — {failure.errors[0]?.message ?? "invalid"}
              </s-list-item>
            ))}
          </s-unordered-list>
          {bulkFailed.length > 10 &&
            `…and ${bulkFailed.length - 10} more.`}
        </s-banner>
      )}

      <s-section heading="Upload a CSV">
        <s-paragraph>
          Two columns: the old path (or full old-site URL) and where it should
          go. Headers like <s-text>path,target</s-text>,{" "}
          <s-text>from,to</s-text> or <s-text>old_url,new_url</s-text> are all
          recognized — up to {DEFAULT_MAX_CSV_ROWS} rows per file. Nothing is
          created until you approve the preview.
        </s-paragraph>
        {limit !== null && (
          <s-paragraph>
            {count} of {limit} Free plan redirects used.
          </s-paragraph>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <s-button
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          {...(isSubmitting ? { loading: true } : {})}
        >
          {fileName ? `Choose a different file` : "Choose CSV file"}
        </s-button>
        {fileName && <s-text>{fileName}</s-text>}
      </s-section>

      {status === "preview" && (
        <s-section heading="Preview">
          <s-paragraph>
            {previewRows.length} row(s) ready to import
            {previewErrors.length > 0 &&
              `, ${previewErrors.length} row(s) skipped`}
            .
          </s-paragraph>
          {previewErrors.length > 0 && (
            <s-banner tone="warning" heading="Rows that will be skipped">
              <s-unordered-list>
                {previewErrors.slice(0, 10).map((error) => (
                  <s-list-item key={error.line}>
                    Line {error.line}: {error.message}
                  </s-list-item>
                ))}
              </s-unordered-list>
              {previewErrors.length > 10 &&
                `…and ${previewErrors.length - 10} more.`}
            </s-banner>
          )}
          {previewRows.length > 0 && (
            <s-button
              variant="primary"
              onClick={applyImport}
              {...(isSubmitting ? { loading: true } : {})}
            >
              Import {previewRows.length} redirect(s)
            </s-button>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
