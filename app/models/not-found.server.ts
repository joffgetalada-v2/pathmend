import db from "../db.server";
import { DEVICE_TYPES, type DeviceType } from "./device";
import { normalizePath } from "./redirects";

export const MAX_404_PATH_LENGTH = 1024;
const MAX_REFERRER_LENGTH = 1024;

export interface NotFoundReport {
  path: string;
  referrer?: string | null;
  deviceType?: string;
}

export type RecordResult = "recorded" | "capture_disabled" | "invalid";

/**
 * Dedupe key for 404 events: lowercased, fragment-stripped, no trailing
 * slash. Returns null for paths we refuse to record (root, over-long).
 */
export function normalize404Path(raw: string): string | null {
  const withoutFragment = raw.split("#")[0] ?? "";
  let path = normalizePath(withoutFragment).toLowerCase();
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path === "/" || path.length > MAX_404_PATH_LENGTH) {
    return null;
  }
  return path;
}

const sanitizeReferrer = (referrer: string | null | undefined): string | null => {
  if (typeof referrer !== "string") return null;
  const trimmed = referrer.trim().slice(0, MAX_REFERRER_LENGTH);
  return trimmed === "" ? null : trimmed;
};

const sanitizeDeviceType = (deviceType: string | undefined): DeviceType =>
  DEVICE_TYPES.includes(deviceType as DeviceType)
    ? (deviceType as DeviceType)
    : "unknown";

async function bumpExistingEvent(
  shop: string,
  path: string,
  referrer: string | null,
  deviceType: DeviceType,
  existing: { referrer: string | null; status: string; deviceType: string },
): Promise<void> {
  await db.notFoundEvent.update({
    where: { shop_path: { shop, path } },
    data: {
      hits: { increment: 1 },
      lastSeenAt: new Date(),
      // First referrer wins — it's the original source attribution.
      referrer: existing.referrer ?? referrer,
      // A 404 recurring after we marked it resolved means the fix regressed;
      // reopen it. Explicitly ignored paths stay ignored.
      status: existing.status === "resolved" ? "unresolved" : existing.status,
      // Latest real signal wins, but a bot/empty UA ("unknown") never
      // erases a previously known device type.
      deviceType:
        deviceType === "unknown" ? existing.deviceType : deviceType,
    },
  });
}

/**
 * Records one storefront 404 sighting, deduped per (shop, normalized path).
 * Never throws for merchant-data reasons — the storefront beacon must stay
 * fire-and-forget; callers only branch on the returned status.
 */
export async function recordNotFoundEvent(
  shop: string,
  report: NotFoundReport,
): Promise<RecordResult> {
  if (typeof report.path !== "string" || report.path.trim() === "") {
    return "invalid";
  }
  const path = normalize404Path(report.path);
  if (path === null) {
    return "invalid";
  }
  const referrer = sanitizeReferrer(report.referrer);
  const deviceType = sanitizeDeviceType(report.deviceType);

  const settings = await db.shopSettings.findUnique({ where: { shop } });
  if (settings && !settings.captureEnabled) {
    return "capture_disabled";
  }

  const existing = await db.notFoundEvent.findUnique({
    where: { shop_path: { shop, path } },
  });

  if (existing) {
    await bumpExistingEvent(shop, path, referrer, deviceType, existing);
    return "recorded";
  }

  try {
    await db.notFoundEvent.create({
      data: { shop, path, referrer, deviceType },
    });
  } catch {
    // Two beacons raced the unique(shop, path) constraint — count the loser.
    // Re-read the winner so its status (e.g. "ignored") is preserved.
    try {
      const winner = await db.notFoundEvent.findUnique({
        where: { shop_path: { shop, path } },
      });
      await bumpExistingEvent(
        shop,
        path,
        referrer,
        deviceType,
        winner ?? { referrer, status: "unresolved", deviceType },
      );
    } catch (error) {
      // Best-effort counting — a lost duplicate beacon is acceptable.
      console.error("404 race fallback failed", error);
    }
  }
  return "recorded";
}
