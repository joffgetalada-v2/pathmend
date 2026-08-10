import db from "../db.server";
import { DEVICE_TYPES, type DeviceType } from "./device";
import {
  NOT_FOUND_PAGE_SIZE,
  NOT_FOUND_STATUSES,
  normalize404Path,
  type NotFoundStatus,
} from "./not-found";

const MAX_REFERRER_LENGTH = 1024;
const MAX_NOT_FOUND_PAGE = 10_000;

export interface NotFoundReport {
  path: string;
  referrer?: string | null;
  deviceType?: string;
}

export type RecordResult = "recorded" | "capture_disabled" | "invalid";

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

export interface NotFoundEventPage<Event> {
  events: Event[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Offset pagination is fine here: the table is local, per-shop, and bounded
 * by the capture rate limit — no cursor complexity needed.
 */
export async function listNotFoundEvents(
  shop: string,
  options: {
    status?: NotFoundStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const status = options.status ?? "unresolved";
  const pageSize = options.pageSize ?? NOT_FOUND_PAGE_SIZE;
  const page = Math.min(
    MAX_NOT_FOUND_PAGE,
    Math.max(1, Math.floor(options.page ?? 1)),
  );
  // Stored paths are lowercased by normalize404Path; lowercase the term too
  // so search stays correct on Postgres (case-sensitive contains), not just
  // on SQLite's case-insensitive default.
  const search = options.search?.trim().toLowerCase();

  const where = {
    shop,
    status,
    ...(search ? { path: { contains: search } } : {}),
  };

  const [events, total] = await Promise.all([
    db.notFoundEvent.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.notFoundEvent.count({ where }),
  ]);

  return { events, total, page, pageSize };
}

export async function setNotFoundStatus(
  shop: string,
  ids: string[],
  status: NotFoundStatus,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await db.notFoundEvent.updateMany({
    where: { shop, id: { in: ids } },
    data: { status },
  });
  return count;
}

export async function notFoundStatusCounts(
  shop: string,
): Promise<Record<NotFoundStatus, number>> {
  const rows = await db.notFoundEvent.groupBy({
    by: ["status"],
    where: { shop },
    _count: true,
  });
  const counts: Record<NotFoundStatus, number> = {
    unresolved: 0,
    resolved: 0,
    ignored: 0,
  };
  for (const row of rows) {
    if (NOT_FOUND_STATUSES.includes(row.status as NotFoundStatus)) {
      counts[row.status as NotFoundStatus] = row._count;
    }
  }
  return counts;
}
