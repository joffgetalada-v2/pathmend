import { describe, expect, test } from "vitest";

import { buildWeeklyDigest, type DigestInput } from "../digest";

const NOW = new Date("2026-08-11T12:00:00Z");

const base: DigestInput = {
  now: NOW,
  events: [],
  redirects: [],
};

describe("buildWeeklyDigest", () => {
  test("counts new 404s, redirects created, and recovered visits in the last 7 days", () => {
    const digest = buildWeeklyDigest({
      ...base,
      events: [
        // Within the last 7 days.
        { firstSeenAt: new Date("2026-08-08T00:00:00Z"), hits: 10, status: "unresolved" },
        { firstSeenAt: new Date("2026-08-10T00:00:00Z"), hits: 3, status: "resolved" },
        // Older — excluded from "new this week".
        { firstSeenAt: new Date("2026-07-01T00:00:00Z"), hits: 99, status: "unresolved" },
      ],
      redirects: [
        { createdAt: new Date("2026-08-09T00:00:00Z") },
        { createdAt: new Date("2026-07-01T00:00:00Z") },
      ],
    });

    expect(digest.newNotFound).toBe(2);
    expect(digest.redirectsCreated).toBe(1);
    expect(digest.recoveredVisits).toBe(3);
  });

  test("is empty when nothing happened this week", () => {
    const digest = buildWeeklyDigest(base);
    expect(digest.newNotFound).toBe(0);
    expect(digest.redirectsCreated).toBe(0);
    expect(digest.recoveredVisits).toBe(0);
    expect(digest.hasActivity).toBe(false);
  });

  test("flags activity when anything happened", () => {
    const digest = buildWeeklyDigest({
      ...base,
      redirects: [{ createdAt: new Date("2026-08-10T00:00:00Z") }],
    });
    expect(digest.hasActivity).toBe(true);
  });

  test("reports the window start and end", () => {
    const digest = buildWeeklyDigest(base);
    expect(digest.periodEnd).toBe("2026-08-11");
    expect(digest.periodStart).toBe("2026-08-04");
  });
});
