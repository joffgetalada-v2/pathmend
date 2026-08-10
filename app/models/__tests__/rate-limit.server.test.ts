import { describe, expect, test } from "vitest";

import {
  MAX_CAPTURES_PER_WINDOW,
  RATE_WINDOW_MS,
  allowCapture,
  trackedShopCount,
} from "../rate-limit.server";

const SHOP = "rate-limit-test.myshopify.com";

describe("allowCapture", () => {
  test("allows captures up to the per-window cap, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_CAPTURES_PER_WINDOW; i += 1) {
      expect(allowCapture(`${SHOP}-a`, now)).toBe(true);
    }
    expect(allowCapture(`${SHOP}-a`, now)).toBe(false);
  });

  test("resets after the window elapses", () => {
    const now = 2_000_000;
    for (let i = 0; i < MAX_CAPTURES_PER_WINDOW; i += 1) {
      allowCapture(`${SHOP}-b`, now);
    }
    expect(allowCapture(`${SHOP}-b`, now)).toBe(false);
    expect(allowCapture(`${SHOP}-b`, now + RATE_WINDOW_MS + 1)).toBe(true);
  });

  test("tracks shops independently", () => {
    const now = 3_000_000;
    for (let i = 0; i < MAX_CAPTURES_PER_WINDOW; i += 1) {
      allowCapture(`${SHOP}-c`, now);
    }
    expect(allowCapture(`${SHOP}-c`, now)).toBe(false);
    expect(allowCapture(`${SHOP}-d`, now)).toBe(true);
  });

  test("evicts stale shop buckets so the map stays bounded", () => {
    const now = 5_000_000;
    allowCapture(`${SHOP}-stale`, now);
    // Two windows later every earlier bucket is stale; the sweep drops them.
    allowCapture(`${SHOP}-fresh`, now + RATE_WINDOW_MS * 2);
    expect(trackedShopCount()).toBe(1);
  });
});
