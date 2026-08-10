import type { NotFoundStatus } from "./not-found";

/**
 * Pure analytics aggregation over stored 404 events. Deliberately no DB
 * imports so the math is unit-testable; analytics.server.ts loads the rows.
 *
 * Data-model note: we store one deduped row per (shop, path) with a hit
 * counter and first/last seen — not per-hit timestamps. So "404s over time"
 * buckets by firstSeenAt (when a broken path first appeared), which answers
 * "how many new broken URLs per day" rather than raw hit volume per day.
 */

export interface NotFoundRow {
  path: string;
  hits: number;
  firstSeenAt: Date;
}

/** Pre-aggregated per-status bucket (from a DB groupBy). */
export interface StatusBucket {
  status: string;
  count: number;
  hits: number;
}

export interface DayBucket {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface AnalyticsSummary {
  statusCounts: Record<NotFoundStatus, number>;
  totalHits: number;
  recoveredVisits: number;
  redirectsCreated: number;
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/**
 * Counts distinct paths first seen per UTC day across an inclusive [from, to]
 * window. Days with no events are present with count 0 so the chart has no
 * gaps.
 */
export function bucketByDay(
  rows: readonly NotFoundRow[],
  window: { from: Date; to: Date },
): DayBucket[] {
  const counts = new Map<string, number>();
  const fromDay = utcDay(window.from);
  const toDay = utcDay(window.to);

  for (const r of rows) {
    const day = utcDay(r.firstSeenAt);
    if (day < fromDay || day > toDay) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const series: DayBucket[] = [];
  for (
    let cursor = new Date(`${fromDay}T00:00:00Z`);
    utcDay(cursor) <= toDay;
    cursor = addUtcDays(cursor, 1)
  ) {
    const date = utcDay(cursor);
    series.push({ date, count: counts.get(date) ?? 0 });
  }
  return series;
}

export function topPaths(
  rows: readonly NotFoundRow[],
  limit: number,
): { path: string; hits: number }[] {
  return [...rows]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((r) => ({ path: r.path, hits: r.hits }));
}

const NOT_FOUND_STATUS_KEYS: readonly NotFoundStatus[] = [
  "unresolved",
  "resolved",
  "ignored",
];

const isKnownStatus = (status: string): status is NotFoundStatus =>
  (NOT_FOUND_STATUS_KEYS as readonly string[]).includes(status);

/**
 * Assembles the summary from pre-aggregated per-status buckets (a DB groupBy),
 * so the caller never loads every row into memory. Unknown statuses still
 * contribute to totalHits but not to the typed status counts.
 */
export function summarizeAnalytics(input: {
  statusBuckets: readonly StatusBucket[];
  redirectsCreated: number;
}): AnalyticsSummary {
  const statusCounts: Record<NotFoundStatus, number> = {
    unresolved: 0,
    resolved: 0,
    ignored: 0,
  };
  let totalHits = 0;
  let recoveredVisits = 0;
  for (const bucket of input.statusBuckets) {
    totalHits += bucket.hits;
    if (isKnownStatus(bucket.status)) {
      statusCounts[bucket.status] += bucket.count;
    }
    if (bucket.status === "resolved") {
      recoveredVisits += bucket.hits;
    }
  }
  return {
    statusCounts,
    totalHits,
    recoveredVisits,
    redirectsCreated: input.redirectsCreated,
  };
}
