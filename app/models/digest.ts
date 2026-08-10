import type { NotFoundStatus } from "./not-found";

/**
 * Pure weekly-digest computation for the in-app card (email digests are
 * explicitly post-launch per the spec). "This week" = the trailing 7 days
 * ending at `now`.
 */

const DIGEST_WINDOW_DAYS = 7;

export interface DigestInput {
  now: Date;
  events: { firstSeenAt: Date; hits: number; status: NotFoundStatus }[];
  redirects: { createdAt: Date }[];
}

export interface WeeklyDigest {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  newNotFound: number;
  redirectsCreated: number;
  recoveredVisits: number;
  hasActivity: boolean;
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

export function buildWeeklyDigest(input: DigestInput): WeeklyDigest {
  const cutoff = new Date(input.now);
  cutoff.setUTCDate(cutoff.getUTCDate() - DIGEST_WINDOW_DAYS);

  const recentEvents = input.events.filter((e) => e.firstSeenAt >= cutoff);
  const newNotFound = recentEvents.length;
  const redirectsCreated = input.redirects.filter(
    (r) => r.createdAt >= cutoff,
  ).length;
  const recoveredVisits = recentEvents
    .filter((e) => e.status === "resolved")
    .reduce((sum, e) => sum + e.hits, 0);

  return {
    periodStart: utcDay(cutoff),
    periodEnd: utcDay(input.now),
    newNotFound,
    redirectsCreated,
    recoveredVisits,
    hasActivity: newNotFound > 0 || redirectsCreated > 0,
  };
}
