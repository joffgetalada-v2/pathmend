/**
 * In-memory per-shop rate limit for the 404 capture endpoint. Crawler storms
 * against a dead site can generate thousands of 404s a minute; beyond the cap
 * we silently drop events — losing tail events is fine, wedging the DB isn't.
 *
 * Per-process only: good enough for a single-instance deploy. If the app ever
 * scales horizontally, move this to the database or a shared store.
 */

export const RATE_WINDOW_MS = 60_000;
export const MAX_CAPTURES_PER_WINDOW = 120;

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

/** Test/ops visibility into the bucket map size. */
export function trackedShopCount(): number {
  return buckets.size;
}

// Drop expired buckets at most once per window so the map stays bounded by
// currently-active shops instead of every shop that ever sent a beacon.
function sweepStaleBuckets(now: number): void {
  if (now - lastSweepAt <= RATE_WINDOW_MS) return;
  lastSweepAt = now;
  for (const [shop, bucket] of buckets) {
    if (now - bucket.windowStart > RATE_WINDOW_MS) {
      buckets.delete(shop);
    }
  }
}

export function allowCapture(shop: string, now = Date.now()): boolean {
  sweepStaleBuckets(now);
  const bucket = buckets.get(shop);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    buckets.set(shop, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= MAX_CAPTURES_PER_WINDOW) {
    return false;
  }
  buckets.set(shop, { ...bucket, count: bucket.count + 1 });
  return true;
}
