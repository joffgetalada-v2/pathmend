import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR: a customer asked the merchant for their data. We never store customer
// PII (404 events hold paths/referrers/device type only, redirects hold URLs),
// so there is nothing to compile — acknowledging with a 200 completes our
// obligation. authenticate.webhook rejects invalid HMACs with a 401 for us.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop} (data_request id: ${
      (payload as { data_request?: { id?: number } }).data_request?.id ?? "n/a"
    }) — no customer data stored, nothing to provide`,
  );

  return new Response();
};
