# Pathmend — Pre-Submission Self-Audit

Audited against the Shopify App Store requirements checklist. This is the
code-auditable pass; items needing a linked store are flagged for live
verification. **No security or compliance code defects block submission** — the
remaining gates are configuration and live checks.

Legend: PASS (verified in code) · ACTION (config/content step before submit) ·
LIVE (correct in code, confirm on a linked store).

## Auth / install
- PASS — `distribution: AppStore`, expiring offline tokens, Prisma session
  storage, no third-party cookies / localStorage auth; every admin route uses
  `authenticate.admin`; app proxy verifies the Shopify signature; managed
  install, no popup OAuth.
- ACTION — `shopify.app.toml` must be completed by `shopify app config link`
  (populates `client_id`, `application_url`, embedded flag, `[auth]`
  redirect URLs). Not deployable until done.

## GDPR / compliance
- PASS — all three mandatory webhooks (`customers/data_request`,
  `customers/redact`, `shop/redact`) subscribed + handled, HMAC-verified;
  `app/uninstalled` → `purgeShopData`. Purge covers **all 5** shop-scoped models
  (Session, Redirect, NotFoundEvent, ShopSettings, PatternRule), transactional
  and idempotent. Stores no customer PII → customer webhooks intentionally
  no-op.
- LIVE — trigger all three + uninstall from the Partner Dashboard; confirm 200s
  and actual DB purge.

## Billing
- PASS — native Shopify Billing API only (zero Stripe/PayPal/external code).
  Free / Pro $9.99 / Migration $19.99, 7-day trials. Self-service
  upgrade/downgrade (no reinstall). Server-side plan gating; test charges off in
  production by default.
- LIVE — trial start, Pro→Migration upgrade, downgrade→Free (proration), all
  without reinstall.

## Scopes
- PASS — single minimal scope `write_online_store_navigation`. `write_products`
  removed; the migration matcher only reads catalog via GraphQL search.

## Listing / naming (code-visible)
- PASS — app name "Pathmend" (no "Shopify"); storefront extension is ~0.4KB,
  404-template only, skipped in the theme editor, no external requests, no
  other-app promotion.
- **FIXED** — splash page (`app/routes/_index/route.tsx`) now carries real
  Pathmend copy (was template placeholder).
- **FIXED** — deleted the leftover template route `app/routes/app.additional.tsx`
  (unlinked, referenced non-existent files).
- **FIXED** — README replaced with a real project README.
- ACTION — set the app proxy `url` in `shopify.app.toml` to the production URL
  (currently a placeholder; CLI rewrites in dev).

## Security hygiene
- PASS — no hardcoded secrets; all config via env; SSRF/ReDoS/body-size/rate-
  limit defenses real and tested; `console.log` only in webhook receipt logging;
  `console.error` on genuine error paths; GraphQL `userErrors` handled on every
  mutation.

## Performance (code-visible)
- PASS — storefront beacon async/tiny/404-only, wrapped so it can't break the
  storefront; live redirects are native `urlRedirect` (never proxied); admin
  fetches parallelized.
- LIVE — Lighthouse (storefront impact ≈ 0) and admin CLS < 0.1 must be measured
  on a real store.

## Production database
- **FIXED (partial)** — `DATABASE_URL` is now env-driven (`prisma/schema.prisma`);
  `.env.example` documents it. The `provider` string is still resolved at
  `prisma generate` time, so the SQLite→Postgres switch for production is a
  one-line schema change + fresh migration (documented in DECISIONS.md), not
  purely an env swap.
- LIVE — run the Postgres migration against the production DB during deploy.

## API version
- PASS — GraphQL-only, pinned to 2025-10 everywhere; no REST.

---

## Must-fix before submission (remaining)
1. Run `shopify app config link` against the production app → complete
   `shopify.app.toml` (`client_id`, `application_url`, embedded, redirect URLs).
2. Set the app proxy `url` to the deployed production URL.
3. Switch the Prisma `provider` to `postgresql` and run the production migration
   (env-driven `DATABASE_URL` is already in place).

## Verify live once the store is linked
1. Fully-populated `shopify.app.toml` after `config link`.
2. Storefront beacon reaches `/apps/pathmend/404`.
3. Lighthouse + Web Vitals (storefront + admin).
4. GDPR webhook delivery + actual purge.
5. Billing end-to-end (trial / upgrade / downgrade / proration).
6. Clean install → configure → uninstall → reinstall leaves no orphaned data.
7. ReDoS guard rejects a pathological user-supplied regex rule at runtime.
8. Accessibility pass (keyboard, aria, screen reader) across all screens.
