import ipaddr from "ipaddr.js";

/**
 * SSRF guard for the sitemap fetcher. A merchant supplies the old site's URL,
 * so it's attacker-influenced: block anything that could reach internal
 * infrastructure and force https so a redirect can't downgrade the check.
 *
 * IP classification is delegated to ipaddr.js — hand-rolled regex/string
 * canonicalization missed IPv4-mapped IPv6 forms (::ffff:7f00:1) and other
 * encodings. An IP literal is allowed ONLY if its range is "unicast".
 *
 * DNS-rebinding note: this validates the literal host. The fetch layer must
 * ALSO re-validate every resolved IP and refuse redirects — see
 * fetchSitemapText in migration.server.ts, which pins the connection to a
 * validated IP and never follows redirects.
 */

/**
 * A URL/host rejection whose message is safe to show the merchant (it names
 * the rule, not internal detail). Network/parse errors are NOT this type, so
 * callers can surface only these directly.
 */
export class SitemapUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitemapUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set(["localhost"]);
const BLOCKED_TLDS = [".local", ".internal", ".localhost"];

/**
 * The address range ipaddr.js assigns, collapsing IPv4-mapped AND
 * IPv4-compatible ("::a.b.c.d", deprecated but still resolved) IPv6 to the
 * embedded IPv4 first. ipaddr.js only special-cases the ::ffff: mapped form
 * and would call "::7f00:1" (== ::127.0.0.1) unicast, so handle the compat
 * form ourselves. Returns null when the host is not an IP literal.
 */
function ipRange(host: string): string | null {
  if (!ipaddr.isValid(host)) return null;
  let addr = ipaddr.parse(host);
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    const parts = v6.parts; // eight 16-bit groups
    const isLowEmbedded = parts.slice(0, 5).every((p) => p === 0);
    // ::ffff:a.b.c.d (mapped) or ::a.b.c.d (compat, group[5]===0) — both put
    // an IPv4 in the low 32 bits. Exclude ::1 (loopback) and :: (unspecified),
    // which ipaddr already classifies correctly as IPv6.
    if (
      isLowEmbedded &&
      (parts[5] === 0xffff || parts[5] === 0) &&
      !(parts[6] === 0 && (parts[7] === 0 || parts[7] === 1))
    ) {
      const hi = parts[6]!;
      const lo = parts[7]!;
      addr = new ipaddr.IPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
    }
  }
  return addr.range();
}

/** True when the host must not be fetched. Errs toward blocking. */
export function isBlockedHost(host: string): boolean {
  // Canonicalize: drop IPv6 brackets, lowercase, strip trailing dots (FQDN
  // form — "127.0.0.1." / "localhost." mean the same host).
  const lower = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

  if (lower === "") return true;
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_TLDS.some((tld) => lower.endsWith(tld))) return true;

  // IP literal (any textual form): allow only genuine public unicast.
  const range = ipRange(lower);
  if (range !== null) return range !== "unicast";

  // Not a valid IP. A hostname with no dot is almost certainly internal.
  if (!lower.includes(".")) return true;

  // IP-shorthand notations ipaddr.js won't parse as valid (decimal
  // "2130706433", hex "0x7f...", dotted shorthand "127.1"): every label is
  // numeric/hex → treat as a numeric IP and block.
  if (/^\d+$/.test(lower)) return true;
  if (/^0x[0-9a-f]/i.test(lower)) return true;
  if (lower.split(".").every((l) => /^(0x[0-9a-f]+|\d+)$/i.test(l))) {
    return true;
  }

  return false;
}

/**
 * Throws unless `rawUrl` is an https URL to a public host with no embedded
 * credentials. Returns the parsed URL on success.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SitemapUrlError("Enter a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new SitemapUrlError("The sitemap URL must start with https://.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new SitemapUrlError("The sitemap URL can't include credentials.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new SitemapUrlError("That host isn't allowed.");
  }
  return url;
}
