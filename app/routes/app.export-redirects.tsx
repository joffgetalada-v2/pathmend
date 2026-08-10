import type { LoaderFunctionArgs } from "react-router";

import { toRedirectCsv } from "../models/csv";
import { fetchAllRedirects } from "../models/redirects.server";
import { authenticate } from "../shopify.server";

/**
 * Resource route (no component): returns the shop's redirects as a CSV
 * download. Fetched client-side with App Bridge's token-injecting fetch,
 * then saved via a Blob link.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const redirects = await fetchAllRedirects(admin);
  const csv = toRedirectCsv(redirects);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="redirects.csv"',
    },
  });
};
