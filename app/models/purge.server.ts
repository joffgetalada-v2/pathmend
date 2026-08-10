import db from "../db.server";

/**
 * Deletes everything we store for a shop. Called from both app/uninstalled
 * and shop/redact, so it must stay idempotent — either webhook can arrive
 * more than once, in any order, and after the data is already gone.
 *
 * Every future shop-scoped Prisma model MUST be added here. This is the
 * single place that guarantees "clean uninstall, nothing left behind".
 */
export async function purgeShopData(shop: string): Promise<void> {
  await db.$transaction([
    // Every future shop-scoped model gets its deleteMany added above
    // sessions. If a table can grow large (404 events), raise the transaction
    // timeout or delete in batches — Prisma's default 5s transaction limit
    // will bite on big shops.
    db.redirect.deleteMany({ where: { shop } }),
    db.notFoundEvent.deleteMany({ where: { shop } }),
    db.shopSettings.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
