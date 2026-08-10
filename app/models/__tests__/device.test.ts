import { describe, expect, test } from "vitest";

import { deviceTypeFromUserAgent } from "../device";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

describe("deviceTypeFromUserAgent", () => {
  test("classifies phones as mobile", () => {
    expect(deviceTypeFromUserAgent(IPHONE)).toBe("mobile");
    expect(deviceTypeFromUserAgent(ANDROID_PHONE)).toBe("mobile");
  });

  test("classifies tablets as tablet (before the mobile check)", () => {
    expect(deviceTypeFromUserAgent(IPAD)).toBe("tablet");
    expect(deviceTypeFromUserAgent(ANDROID_TABLET)).toBe("tablet");
  });

  test("classifies desktop browsers as desktop", () => {
    expect(deviceTypeFromUserAgent(DESKTOP)).toBe("desktop");
  });

  test("returns unknown for missing or empty user agents", () => {
    expect(deviceTypeFromUserAgent(null)).toBe("unknown");
    expect(deviceTypeFromUserAgent("")).toBe("unknown");
  });
});
