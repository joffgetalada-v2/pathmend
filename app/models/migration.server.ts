import { lookup } from "node:dns/promises";

import { assertPublicHttpUrl, isBlockedHost } from "./ssrf.server";

/**
 * SSRF-hardened sitemap fetch. Layered defenses:
 *  1. URL shape: https-only, no credentials, public host (assertPublicHttpUrl).
 *  2. DNS rebinding: resolve the host and re-check every returned IP before
 *     connecting, so a name that passed step 1 can't point at an internal IP.
 *  3. Redirects: not followed (redirect: "manual") — a 3xx to an internal
 *     host is rejected rather than chased.
 *  4. Size: Content-Length pre-check plus a streaming byte cap.
 *  5. Timeout: AbortController.
 *
 * DNS and fetch are injected so the guards are unit-testable without network.
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchSitemapDeps {
  resolve: (host: string) => Promise<string[]>;
  fetchImpl: typeof fetch;
}

const defaultResolve = async (host: string): Promise<string[]> => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

const readCapped = async (
  response: Response,
  maxBytes: number,
): Promise<string> => {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("The sitemap is too large.");
      }
      chunks.push(value);
    }
  }
  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array(0)),
  );
};

export async function fetchSitemapText(
  rawUrl: string,
  deps: FetchSitemapDeps = { resolve: defaultResolve, fetchImpl: fetch },
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = assertPublicHttpUrl(rawUrl);

  // DNS-rebinding guard: every resolved IP must itself be public. Strip IPv6
  // brackets so the resolver sees a bare host and the guard fails closed
  // rather than depending on a resolver quirk for bracketed literals.
  //
  // Residual TOCTOU: global fetch re-resolves independently at connect time,
  // so a sub-second DNS rebind between this check and the connection could
  // still slip through. We accept this narrow window — it requires the
  // attacker to control authoritative DNS for their own migration target with
  // precise timing, and redirect:manual + https-only already block the common
  // vectors. Pinning to the IP would defeat TLS certificate validation.
  const resolveHost = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await deps.resolve(resolveHost);
  if (addresses.length === 0) {
    throw new Error("That host could not be resolved.");
  }
  for (const address of addresses) {
    if (isBlockedHost(address)) {
      throw new Error("That host resolves to a blocked address.");
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await deps.fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual", // never chase a redirect to an internal host
      signal: controller.signal,
      headers: { accept: "application/xml,text/xml,*/*" },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("The sitemap URL redirects; enter the final URL.");
    }
    if (!response.ok) {
      throw new Error(`The sitemap couldn't be loaded (${response.status}).`);
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (declaredLength > maxBytes) {
      throw new Error("The sitemap is too large.");
    }

    return await readCapped(response, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}
