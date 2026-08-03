import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { purgeShopData } from "../models/purge.server";

// GDPR: sent ~48h after uninstall. Final, unconditional erasure of everything
// we hold for the shop. app/uninstalled already purged once; purgeShopData is
// idempotent so running it again is safe and catches anything written between
// uninstall and redact.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  await purgeShopData(shop);
  console.log(`Received ${topic} webhook for ${shop} — all shop data purged`);

  return new Response();
};
