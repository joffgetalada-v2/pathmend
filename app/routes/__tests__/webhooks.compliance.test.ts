import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the framework boundary: authenticate.webhook validates HMAC and parses
// the payload. These tests cover our handler logic on both sides of it.
const authenticateWebhook = vi.fn();
vi.mock("../../shopify.server", () => ({
  authenticate: { webhook: (request: Request) => authenticateWebhook(request) },
}));

const deleteManySessions = vi.fn();
const deleteManyRedirects = vi.fn();
const deleteManyNotFoundEvents = vi.fn();
const deleteManyShopSettings = vi.fn();
const deleteManyPatternRules = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock("../../db.server", () => ({
  default: {
    session: { deleteMany: (args: unknown) => deleteManySessions(args) },
    redirect: { deleteMany: (args: unknown) => deleteManyRedirects(args) },
    notFoundEvent: {
      deleteMany: (args: unknown) => deleteManyNotFoundEvents(args),
    },
    shopSettings: {
      deleteMany: (args: unknown) => deleteManyShopSettings(args),
    },
    patternRule: {
      deleteMany: (args: unknown) => deleteManyPatternRules(args),
    },
    $transaction: (ops: unknown[]) => transaction(ops),
  },
}));

import { action as dataRequestAction } from "../webhooks.customers.data_request";
import { action as customersRedactAction } from "../webhooks.customers.redact";
import { action as shopRedactAction } from "../webhooks.shop.redact";
import { action as uninstalledAction } from "../webhooks.app.uninstalled";

const SHOP = "example.myshopify.com";

const makeArgs = () => ({
  request: new Request("https://app.example.com/webhooks", { method: "POST" }),
  params: {},
  context: {},
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("customers/data_request", () => {
  test("acknowledges with 200 and touches no data", async () => {
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "CUSTOMERS_DATA_REQUEST",
      payload: { data_request: { id: 9999 } },
    });

    const response = await dataRequestAction(makeArgs() as never);

    expect(response.status).toBe(200);
    expect(deleteManySessions).not.toHaveBeenCalled();
  });
});

describe("customers/redact", () => {
  test("acknowledges with 200 and touches no data", async () => {
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "CUSTOMERS_REDACT",
      payload: { customer: { id: 1 } },
    });

    const response = await customersRedactAction(makeArgs() as never);

    expect(response.status).toBe(200);
    expect(deleteManySessions).not.toHaveBeenCalled();
  });
});

describe("shop/redact", () => {
  test("purges all shop data and returns 200", async () => {
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "SHOP_REDACT",
      payload: { shop_domain: SHOP },
    });

    const response = await shopRedactAction(makeArgs() as never);

    expect(response.status).toBe(200);
    expect(deleteManySessions).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(deleteManyRedirects).toHaveBeenCalledWith({
      where: { shop: SHOP },
    });
    expect(deleteManyNotFoundEvents).toHaveBeenCalledWith({
      where: { shop: SHOP },
    });
    expect(deleteManyShopSettings).toHaveBeenCalledWith({
      where: { shop: SHOP },
    });
    expect(deleteManyPatternRules).toHaveBeenCalledWith({
      where: { shop: SHOP },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("app/uninstalled", () => {
  test("purges shop data even when the session is already gone", async () => {
    // No `session` key at all — mirrors a retry after uninstall completed.
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      session: undefined,
    });

    const response = await uninstalledAction(makeArgs() as never);

    expect(response.status).toBe(200);
    expect(deleteManySessions).toHaveBeenCalledWith({ where: { shop: SHOP } });
  });
});

describe("invalid HMAC", () => {
  test.each([
    ["customers/data_request", dataRequestAction],
    ["customers/redact", customersRedactAction],
    ["shop/redact", shopRedactAction],
    ["app/uninstalled", uninstalledAction],
  ])("%s propagates the framework's 401 without side effects", async (_topic, action) => {
    const unauthorized = new Response(undefined, { status: 401, statusText: "Unauthorized" });
    authenticateWebhook.mockRejectedValue(unauthorized);

    await expect(action(makeArgs() as never)).rejects.toBe(unauthorized);
    expect(deleteManySessions).not.toHaveBeenCalled();
  });
});
