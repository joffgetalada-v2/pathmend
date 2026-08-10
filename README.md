# Pathmend — Redirect & 404 Manager

A public Shopify app that catches storefront 404s and fixes them with one-click
301 redirects — built for store migrations from WordPress, WooCommerce,
BigCommerce, and Magento.

## What it does

- **Automatic 404 detection** — a tiny theme app embed reports missed paths to
  an app-proxy endpoint (hit counts, referrer, device type), deduped per path.
- **One-click & bulk redirects** — turn 404s into native Shopify `urlRedirect`
  objects (never proxied, so no latency or SEO risk).
- **Migration importer** — CSV or SSRF-hardened sitemap fetch → matches old URLs
  to products/collections/pages via GraphQL search with confidence scores.
- **Pattern rules & auto-heal** — wildcard/regex rules that materialize a
  concrete redirect when a matching 404 arrives.
- **Bulk CSV import/export** with dry-run preview.
- **Analytics** — 404s over time, top missing paths, resolved vs. unresolved,
  recovered-visit estimates, and a weekly in-app digest.

## Tech

- Shopify App (React Router 7 template, TypeScript strict), embedded admin.
- GraphQL Admin API **only**, pinned to **2025-10**. No REST.
- App Bridge + Polaris web components for all admin UI.
- Prisma ORM (SQLite in dev; Postgres in production via env — see
  `DECISIONS.md`).
- Shopify Billing API for all charges (Free / Pro $9.99 / Migration $19.99,
  7-day trials).
- Theme app extension for the storefront 404-capture beacon (< 5KB, async,
  404-template only, zero external requests).

## Development

Node is pinned to the `>=22.12` range; this project uses a local Node 22:

```bash
PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev
```

Common tasks:

```bash
npm test          # vitest — unit + route tests
npm run typecheck # react-router typegen && tsc --noEmit
npm run build     # production build
npm run lint      # eslint
```

## Project docs

- `CLAUDE.md` — the master build spec.
- `PROGRESS.md` — phase checklist and current status.
- `DECISIONS.md` — dated log of non-obvious engineering decisions.
- `docs/` — App Store listing copy, screenshot shot-list, screencast script,
  demo-data plan, and the pre-submission self-audit.

## Compliance

- Mandatory GDPR webhooks implemented (`customers/data_request`,
  `customers/redact`, `shop/redact`) plus `app/uninstalled` → full shop-data
  purge (`app/models/purge.server.ts`).
- Stores no Shopify customer PII; the customer webhooks are intentional no-ops.
- Minimal scope: `write_online_store_navigation`.
