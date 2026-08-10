import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { deviceTypeFromUserAgent } from "../models/device";
import { normalize404Path } from "../models/not-found";
import { recordNotFoundEvent } from "../models/not-found.server";
import { autoHealNotFound } from "../models/patterns.server";
import { allowCapture } from "../models/rate-limit.server";
import { authenticate } from "../shopify.server";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * App Proxy target for the storefront 404 beacon (/apps/pathmend/404).
 * authenticate.public.appProxy verifies Shopify's signature; requests that
 * fail verification throw before any handler code runs.
 *
 * Responses are intentionally empty — the beacon is fire-and-forget and
 * storefront visitors must never see app internals.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  // Valid signature but no offline session (e.g. mid-uninstall): drop quietly.
  if (!session) {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  if (!allowCapture(session.shop)) {
    // Over the per-shop cap (crawler storm): drop without hinting at limits.
    return new Response(null, { status: 204 });
  }

  // The beacon payload is two short strings (~200 bytes). Cap the body before
  // buffering so an anonymous visitor can't post a huge blob into memory —
  // Content-Length first, then the read length as the chunked-encoding backstop.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }
  const { path, referrer } = (payload ?? {}) as {
    path?: unknown;
    referrer?: unknown;
  };
  if (typeof path !== "string") {
    return new Response(null, { status: 400 });
  }

  const result = await recordNotFoundEvent(session.shop, {
    path,
    referrer: typeof referrer === "string" ? referrer : null,
    deviceType: deviceTypeFromUserAgent(request.headers.get("user-agent")),
  });

  if (result === "recorded" && admin) {
    const normalized = normalize404Path(path);
    if (normalized) {
      try {
        // Auto-heal: a matching pattern rule materializes a real redirect.
        // Never let it affect the beacon response.
        await autoHealNotFound(admin, session.shop, normalized);
      } catch (error) {
        console.error("auto-heal failed", error);
      }
    }
  }

  return new Response(null, { status: result === "invalid" ? 400 : 204 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  // The capture endpoint is POST-only.
  return new Response(null, { status: 405 });
};
