import db from "../db.server";
import {
  bucketByDay,
  summarizeAnalytics,
  topPaths,
  type AnalyticsSummary,
  type DayBucket,
  type NotFoundRow,
  type StatusBucket,
} from "./analytics";
import { buildWeeklyDigest, type WeeklyDigest } from "./digest";
import type { NotFoundStatus } from "./not-found";

const TOP_PATHS_LIMIT = 10;
const DIGEST_WINDOW_DAYS = 7;
// Bounds the in-memory window fetch (chart + top-paths). A shop with more
// distinct broken paths than this in the window still gets correct aggregate
// totals (those come from the DB groupBy), just a capped chart/top-N sample.
const WINDOW_ROW_CAP = 5000;

export interface AnalyticsData {
  summary: AnalyticsSummary;
  series: DayBucket[];
  topPaths: { path: string; hits: number }[];
  days: number;
}

const windowStart = (now: Date, days: number): Date => {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  return from;
};

export async function loadAnalytics(
  shop: string,
  options: { now: Date; days: number },
): Promise<AnalyticsData> {
  const { now, days } = options;
  const from = windowStart(now, days);

  const [statusGroups, windowEvents, redirectsCreated] = await Promise.all([
    // Aggregate over ALL of the shop's events in the DB — no rows loaded.
    db.notFoundEvent.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
      _sum: { hits: true },
    }),
    // Bounded window fetch drives the day-series and top-paths only.
    db.notFoundEvent.findMany({
      where: { shop, firstSeenAt: { gte: from } },
      select: { path: true, hits: true, firstSeenAt: true },
      orderBy: { hits: "desc" },
      take: WINDOW_ROW_CAP,
    }),
    db.redirect.count({ where: { shop, createdAt: { gte: from } } }),
  ]);

  const statusBuckets: StatusBucket[] = (
    statusGroups as {
      status: string;
      _count: number;
      _sum: { hits: number | null };
    }[]
  ).map((g) => ({
    status: g.status,
    count: g._count,
    hits: g._sum.hits ?? 0,
  }));
  const rows = windowEvents as NotFoundRow[];

  return {
    summary: summarizeAnalytics({ statusBuckets, redirectsCreated }),
    series: bucketByDay(rows, { from, to: now }),
    topPaths: topPaths(rows, TOP_PATHS_LIMIT),
    days,
  };
}

export async function loadWeeklyDigest(
  shop: string,
  now: Date,
): Promise<WeeklyDigest> {
  const from = windowStart(now, DIGEST_WINDOW_DAYS);

  const [events, redirects] = await Promise.all([
    db.notFoundEvent.findMany({
      where: { shop, firstSeenAt: { gte: from } },
      select: { firstSeenAt: true, hits: true, status: true },
    }),
    db.redirect.findMany({
      where: { shop, createdAt: { gte: from } },
      select: { createdAt: true },
    }),
  ]);

  return buildWeeklyDigest({
    now,
    events: events as {
      firstSeenAt: Date;
      hits: number;
      status: NotFoundStatus;
    }[],
    redirects,
  });
}
