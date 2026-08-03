import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR: erase a specific customer's data. We never store customer PII, so a
// 200 acknowledgment completes our obligation. If a future feature ever ties
// data to customer ids, deletion for payload.customer.id belongs here.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop} — no customer data stored, nothing to redact`,
  );

  return new Response();
};
