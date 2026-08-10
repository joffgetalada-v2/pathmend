export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export const DEVICE_TYPES: readonly DeviceType[] = [
  "desktop",
  "mobile",
  "tablet",
  "unknown",
];

/**
 * Coarse UA classification for 404 analytics — good enough grouping, not
 * fingerprinting. Tablet must be checked first: iPad UAs also contain
 * "Mobile", and Android tablets are "Android" without "Mobile".
 */
export function deviceTypeFromUserAgent(
  userAgent: string | null,
): DeviceType {
  if (!userAgent) return "unknown";
  if (
    /ipad|tablet/i.test(userAgent) ||
    (/android/i.test(userAgent) && !/mobile/i.test(userAgent))
  ) {
    return "tablet";
  }
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}
