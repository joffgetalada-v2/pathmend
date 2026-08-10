import { beforeEach, describe, expect, test, vi } from "vitest";

const findUniqueSettings = vi.fn();
const findUniqueEvent = vi.fn();
const updateEvent = vi.fn();
const createEvent = vi.fn();
vi.mock("../../db.server", () => ({
  default: {
    shopSettings: {
      findUnique: (args: unknown) => findUniqueSettings(args),
    },
    notFoundEvent: {
      findUnique: (args: unknown) => findUniqueEvent(args),
      update: (args: unknown) => updateEvent(args),
      create: (args: unknown) => createEvent(args),
    },
  },
}));

import { normalize404Path, recordNotFoundEvent } from "../not-found.server";

const SHOP = "example.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueSettings.mockResolvedValue(null);
  findUniqueEvent.mockResolvedValue(null);
  updateEvent.mockResolvedValue({});
  createEvent.mockResolvedValue({});
});

describe("normalize404Path", () => {
  test("lowercases and strips trailing slashes and fragments", () => {
    expect(normalize404Path("/Old-Page/")).toBe("/old-page");
    expect(normalize404Path("/old#section")).toBe("/old");
    expect(normalize404Path("/old?q=A")).toBe("/old?q=a");
  });

  test("rejects the root path and over-long paths", () => {
    expect(normalize404Path("/")).toBeNull();
    expect(normalize404Path(`/${"x".repeat(2000)}`)).toBeNull();
  });
});

describe("recordNotFoundEvent", () => {
  test("creates a new event on first sighting", async () => {
    const result = await recordNotFoundEvent(SHOP, {
      path: "/Missing-Page/",
      referrer: "https://google.com",
      deviceType: "mobile",
    });

    expect(result).toBe("recorded");
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        shop: SHOP,
        path: "/missing-page",
        referrer: "https://google.com",
        deviceType: "mobile",
      },
    });
  });

  test("increments hits and bumps lastSeenAt on repeat sightings", async () => {
    findUniqueEvent.mockResolvedValue({
      referrer: "https://first.com",
      status: "unresolved",
      deviceType: "desktop",
    });

    const result = await recordNotFoundEvent(SHOP, {
      path: "/missing-page",
      referrer: "https://second.com",
      deviceType: "mobile",
    });

    expect(result).toBe("recorded");
    expect(createEvent).not.toHaveBeenCalled();
    const args = updateEvent.mock.calls[0]![0];
    expect(args.where).toEqual({
      shop_path: { shop: SHOP, path: "/missing-page" },
    });
    expect(args.data.hits).toEqual({ increment: 1 });
    // First referrer wins — original source attribution.
    expect(args.data.referrer).toBe("https://first.com");
    expect(args.data.lastSeenAt).toBeInstanceOf(Date);
  });

  test("reopens resolved events but leaves ignored ones ignored", async () => {
    findUniqueEvent.mockResolvedValue({
      referrer: null,
      status: "resolved",
      deviceType: "unknown",
    });
    await recordNotFoundEvent(SHOP, { path: "/back-again" });
    expect(updateEvent.mock.calls[0]![0].data.status).toBe("unresolved");

    findUniqueEvent.mockResolvedValue({
      referrer: null,
      status: "ignored",
      deviceType: "unknown",
    });
    await recordNotFoundEvent(SHOP, { path: "/noise" });
    expect(updateEvent.mock.calls[1]![0].data.status).toBe("ignored");
  });

  test("skips writing when capture is disabled for the shop", async () => {
    findUniqueSettings.mockResolvedValue({ shop: SHOP, captureEnabled: false });

    const result = await recordNotFoundEvent(SHOP, { path: "/missing" });

    expect(result).toBe("capture_disabled");
    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  test("rejects invalid paths", async () => {
    expect(await recordNotFoundEvent(SHOP, { path: "/" })).toBe("invalid");
    expect(await recordNotFoundEvent(SHOP, { path: "" })).toBe("invalid");
    expect(createEvent).not.toHaveBeenCalled();
  });

  test("falls back to an update when the create races a duplicate", async () => {
    createEvent.mockRejectedValue(new Error("Unique constraint failed"));

    const result = await recordNotFoundEvent(SHOP, { path: "/race" });

    expect(result).toBe("recorded");
    expect(updateEvent).toHaveBeenCalled();
  });

  test("race fallback re-reads the winner so ignored stays ignored", async () => {
    createEvent.mockRejectedValue(new Error("Unique constraint failed"));
    // First read (pre-create) sees nothing; the re-read finds the race winner.
    findUniqueEvent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        referrer: null,
        status: "ignored",
        deviceType: "unknown",
      });

    await recordNotFoundEvent(SHOP, { path: "/race-ignored" });

    expect(updateEvent.mock.calls[0]![0].data.status).toBe("ignored");
  });

  test("refreshes deviceType from real signal but never downgrades to unknown", async () => {
    findUniqueEvent.mockResolvedValue({
      referrer: null,
      status: "unresolved",
      deviceType: "unknown",
    });
    await recordNotFoundEvent(SHOP, { path: "/x", deviceType: "mobile" });
    expect(updateEvent.mock.calls[0]![0].data.deviceType).toBe("mobile");

    findUniqueEvent.mockResolvedValue({
      referrer: null,
      status: "unresolved",
      deviceType: "mobile",
    });
    await recordNotFoundEvent(SHOP, { path: "/x", deviceType: "smart-fridge" });
    expect(updateEvent.mock.calls[1]![0].data.deviceType).toBe("mobile");
  });

  test("normalizes unknown device types", async () => {
    await recordNotFoundEvent(SHOP, {
      path: "/missing",
      deviceType: "smart-fridge",
    });
    expect(createEvent.mock.calls[0]![0].data.deviceType).toBe("unknown");
  });
});
