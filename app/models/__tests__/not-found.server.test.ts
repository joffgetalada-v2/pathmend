import { beforeEach, describe, expect, test, vi } from "vitest";

const findUniqueSettings = vi.fn();
const findUniqueEvent = vi.fn();
const updateEvent = vi.fn();
const createEvent = vi.fn();
const findManyEvents = vi.fn();
const countEvents = vi.fn();
const updateManyEvents = vi.fn();
const groupByEvents = vi.fn();
vi.mock("../../db.server", () => ({
  default: {
    shopSettings: {
      findUnique: (args: unknown) => findUniqueSettings(args),
    },
    notFoundEvent: {
      findUnique: (args: unknown) => findUniqueEvent(args),
      update: (args: unknown) => updateEvent(args),
      create: (args: unknown) => createEvent(args),
      findMany: (args: unknown) => findManyEvents(args),
      count: (args: unknown) => countEvents(args),
      updateMany: (args: unknown) => updateManyEvents(args),
      groupBy: (args: unknown) => groupByEvents(args),
    },
  },
}));

import { normalize404Path } from "../not-found";
import {
  listNotFoundEvents,
  notFoundStatusCounts,
  recordNotFoundEvent,
  setNotFoundStatus,
} from "../not-found.server";

const SHOP = "example.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueSettings.mockResolvedValue(null);
  findUniqueEvent.mockResolvedValue(null);
  updateEvent.mockResolvedValue({});
  createEvent.mockResolvedValue({});
  findManyEvents.mockResolvedValue([]);
  countEvents.mockResolvedValue(0);
  updateManyEvents.mockResolvedValue({ count: 0 });
  groupByEvents.mockResolvedValue([]);
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

describe("listNotFoundEvents", () => {
  test("filters by shop and status, newest last-seen first, offset paging", async () => {
    findManyEvents.mockResolvedValue([{ id: "1" }]);
    countEvents.mockResolvedValue(60);

    const result = await listNotFoundEvents(SHOP, {
      status: "unresolved",
      page: 3,
      pageSize: 25,
    });

    expect(findManyEvents).toHaveBeenCalledWith({
      where: { shop: SHOP, status: "unresolved" },
      orderBy: { lastSeenAt: "desc" },
      skip: 50,
      take: 25,
    });
    expect(result).toEqual({ events: [{ id: "1" }], total: 60, page: 3, pageSize: 25 });
  });

  test("lowercases the search term to match normalized stored paths", async () => {
    // Stored paths are always lowercased; SQLite's contains is
    // case-insensitive but Postgres's is not — don't rely on the quirk.
    await listNotFoundEvents(SHOP, { search: "Blog" });

    expect(findManyEvents.mock.calls[0]![0].where).toEqual({
      shop: SHOP,
      status: "unresolved",
      path: { contains: "blog" },
    });
  });

  test("clamps page numbers at both ends", async () => {
    await listNotFoundEvents(SHOP, { page: -5 });
    expect(findManyEvents.mock.calls[0]![0].skip).toBe(0);

    await listNotFoundEvents(SHOP, { page: 999_999_999, pageSize: 25 });
    expect(findManyEvents.mock.calls[1]![0].skip).toBe((10_000 - 1) * 25);
  });
});

describe("setNotFoundStatus", () => {
  test("updates only the given ids within the shop", async () => {
    updateManyEvents.mockResolvedValue({ count: 2 });

    const count = await setNotFoundStatus(SHOP, ["a", "b"], "ignored");

    expect(updateManyEvents).toHaveBeenCalledWith({
      where: { shop: SHOP, id: { in: ["a", "b"] } },
      data: { status: "ignored" },
    });
    expect(count).toBe(2);
  });

  test("does nothing for an empty id list", async () => {
    const count = await setNotFoundStatus(SHOP, [], "ignored");
    expect(count).toBe(0);
    expect(updateManyEvents).not.toHaveBeenCalled();
  });
});

describe("notFoundStatusCounts", () => {
  test("maps groupBy rows onto all three statuses, defaulting to 0", async () => {
    groupByEvents.mockResolvedValue([
      { status: "unresolved", _count: 7 },
      { status: "ignored", _count: 2 },
    ]);

    const counts = await notFoundStatusCounts(SHOP);

    expect(counts).toEqual({ unresolved: 7, resolved: 0, ignored: 2 });
  });
});
