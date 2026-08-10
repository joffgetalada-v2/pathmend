import { beforeEach, describe, expect, test, vi } from "vitest";

const findManyEvents = vi.fn();
const countRedirectsInRange = vi.fn();
const findManyRedirects = vi.fn();
const groupByEvents = vi.fn();
vi.mock("../../db.server", () => ({
  default: {
    notFoundEvent: {
      findMany: (a: unknown) => findManyEvents(a),
      groupBy: (a: unknown) => groupByEvents(a),
    },
    redirect: {
      count: (a: unknown) => countRedirectsInRange(a),
      findMany: (a: unknown) => findManyRedirects(a),
    },
  },
}));

import { loadAnalytics, loadWeeklyDigest } from "../analytics.server";

const SHOP = "example.myshopify.com";
const NOW = new Date("2026-08-11T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  findManyEvents.mockResolvedValue([]);
  countRedirectsInRange.mockResolvedValue(0);
  findManyRedirects.mockResolvedValue([]);
  groupByEvents.mockResolvedValue([]);
});

describe("loadAnalytics", () => {
  test("scopes every query to the shop and computes aggregates", async () => {
    groupByEvents.mockResolvedValue([
      { status: "resolved", _count: 1, _sum: { hits: 5 } },
      { status: "unresolved", _count: 2, _sum: { hits: 20 } },
    ]);
    // Bounded window fetch drives the day-series + top-paths.
    findManyEvents.mockResolvedValue([
      {
        path: "/a",
        hits: 5,
        firstSeenAt: new Date("2026-08-10T00:00:00Z"),
      },
    ]);
    countRedirectsInRange.mockResolvedValue(3);

    const result = await loadAnalytics(SHOP, { now: NOW, days: 30 });

    expect(groupByEvents.mock.calls[0]![0].where.shop).toBe(SHOP);
    expect(findManyEvents.mock.calls[0]![0].where.shop).toBe(SHOP);
    expect(countRedirectsInRange.mock.calls[0]![0].where.shop).toBe(SHOP);
    // Aggregates come from groupBy, not from loading every row.
    expect(result.summary.statusCounts).toEqual({
      unresolved: 2,
      resolved: 1,
      ignored: 0,
    });
    expect(result.summary.totalHits).toBe(25);
    expect(result.summary.recoveredVisits).toBe(5);
    expect(result.summary.redirectsCreated).toBe(3);
    expect(result.series.length).toBe(31); // inclusive 30-day window
    expect(result.topPaths[0]).toEqual({ path: "/a", hits: 5 });
  });

  test("bounds the window fetch with a take cap and window filter", async () => {
    await loadAnalytics(SHOP, { now: NOW, days: 30 });
    const args = findManyEvents.mock.calls[0]![0];
    expect(args.where.firstSeenAt.gte).toBeInstanceOf(Date);
    expect(typeof args.take).toBe("number");
  });
});

describe("loadWeeklyDigest", () => {
  test("builds the digest from shop-scoped recent rows", async () => {
    findManyEvents.mockResolvedValue([
      { firstSeenAt: new Date("2026-08-09T00:00:00Z"), hits: 4, status: "resolved" },
    ]);
    findManyRedirects.mockResolvedValue([
      { createdAt: new Date("2026-08-09T00:00:00Z") },
    ]);

    const digest = await loadWeeklyDigest(SHOP, NOW);

    expect(findManyEvents.mock.calls[0]![0].where.shop).toBe(SHOP);
    expect(digest.newNotFound).toBe(1);
    expect(digest.redirectsCreated).toBe(1);
    expect(digest.recoveredVisits).toBe(4);
  });
});
