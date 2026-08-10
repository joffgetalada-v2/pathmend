import { describe, expect, test } from "vitest";

import {
  bucketByDay,
  summarizeAnalytics,
  topPaths,
  type NotFoundRow,
} from "../analytics";

const row = (over: Partial<NotFoundRow> = {}): NotFoundRow => ({
  path: "/x",
  hits: 1,
  firstSeenAt: new Date("2026-08-01T00:00:00Z"),
  ...over,
});

describe("bucketByDay", () => {
  test("counts distinct paths first seen per UTC day across a window", () => {
    const rows = [
      row({ firstSeenAt: new Date("2026-08-10T09:00:00Z") }),
      row({ firstSeenAt: new Date("2026-08-10T20:00:00Z") }),
      row({ firstSeenAt: new Date("2026-08-11T01:00:00Z") }),
    ];
    const series = bucketByDay(rows, {
      from: new Date("2026-08-09T00:00:00Z"),
      to: new Date("2026-08-11T00:00:00Z"),
    });
    // Inclusive 3-day window: 09, 10, 11.
    expect(series).toEqual([
      { date: "2026-08-09", count: 0 },
      { date: "2026-08-10", count: 2 },
      { date: "2026-08-11", count: 1 },
    ]);
  });

  test("ignores rows outside the window", () => {
    const rows = [row({ firstSeenAt: new Date("2026-07-01T00:00:00Z") })];
    const series = bucketByDay(rows, {
      from: new Date("2026-08-10T00:00:00Z"),
      to: new Date("2026-08-10T00:00:00Z"),
    });
    expect(series).toEqual([{ date: "2026-08-10", count: 0 }]);
  });
});

describe("topPaths", () => {
  test("returns the highest-hit paths, capped", () => {
    const rows = [
      row({ path: "/a", hits: 5 }),
      row({ path: "/b", hits: 50 }),
      row({ path: "/c", hits: 20 }),
    ];
    expect(topPaths(rows, 2)).toEqual([
      { path: "/b", hits: 50 },
      { path: "/c", hits: 20 },
    ]);
  });
});

describe("summarizeAnalytics", () => {
  test("assembles a summary from pre-aggregated status buckets", () => {
    const summary = summarizeAnalytics({
      statusBuckets: [
        { status: "unresolved", count: 1, hits: 10 },
        { status: "resolved", count: 2, hits: 42 },
        { status: "ignored", count: 1, hits: 5 },
      ],
      redirectsCreated: 9,
    });

    expect(summary.statusCounts).toEqual({
      unresolved: 1,
      resolved: 2,
      ignored: 1,
    });
    expect(summary.totalHits).toBe(57);
    expect(summary.recoveredVisits).toBe(42);
    expect(summary.redirectsCreated).toBe(9);
  });

  test("handles an empty dataset", () => {
    const summary = summarizeAnalytics({
      statusBuckets: [],
      redirectsCreated: 0,
    });
    expect(summary.totalHits).toBe(0);
    expect(summary.recoveredVisits).toBe(0);
    expect(summary.statusCounts).toEqual({
      unresolved: 0,
      resolved: 0,
      ignored: 0,
    });
  });

  test("ignores unknown status buckets defensively", () => {
    const summary = summarizeAnalytics({
      statusBuckets: [{ status: "weird", count: 3, hits: 9 }],
      redirectsCreated: 0,
    });
    expect(summary.totalHits).toBe(9); // hits still count toward total
    expect(summary.statusCounts).toEqual({
      unresolved: 0,
      resolved: 0,
      ignored: 0,
    });
  });
});
