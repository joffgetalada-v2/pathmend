# Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-08-04 | React Router template (shopify-app-template-react-router), not Remix | shopify.dev now marks it "the recommended path for most apps"; TS + Prisma/SQLite built in; API version pinned 2025-10 |
| 2026-08-04 | Scaffolded via direct git clone instead of `shopify app init` | CLI 3.84 forces interactive Shopify auth during init (creates the app in the Partner org up front); clone is deterministic, app link happens at first `shopify app dev` |
| 2026-08-04 | Run node via `/usr/local/opt/node@22/bin` (22.23.1) PATH prefix | Default node 22.9.0 falls inside template's excluded engine range (`>=22 <22.12`); didn't relink system node without asking |
| 2026-08-04 | Kept template's AGENTS.md, dropped its CLAUDE.md | Our CLAUDE.md is the project master prompt; AGENTS.md carries the same Shopify AI Toolkit pointer |
| 2026-08-04 | Commit package-lock.json (template gitignores it) | Template stays package-manager-agnostic; we're npm-only and want reproducible installs for CI/Docker |
| 2026-08-10 | Manual Billing API (appSubscriptionCreate via package `billing` config), not Shopify Managed Pricing | shopify.dev now recommends Managed Pricing as default for new App Store apps, but manual is confirmed available and non-deprecated on 2025-10. Manual keeps plan gating + trials fully in code, testable now without Partner Dashboard access (store link still pending). Gating reads active subscriptions, so switching to Managed Pricing later only swaps the purchase flow — flag for owner review before submission |
| 2026-08-10 | Billing test mode: test charges outside production by default; `BILLING_TEST_MODE=true\|false` env override wins either way | Dev stores can't be charged real money; production must default to real charges. Override supports demoing real flow in dev-like envs and test charges on a production deploy during app review |
| 2026-08-10 | Plan/feature logic lives in `app/models/plans.ts` (shared, no `.server` suffix) | Plan metadata renders in the client (plan page); React Router build forbids `.server` imports from components. Nothing secret in plan names/prices/features. Billing calls stay in `billing.server.ts` |
| 2026-08-10 | Free tier = no Shopify subscription at all; plan derived as highest-ranked active subscription name | Shopify has no $0 subscription concept worth carrying; `resolvePlan` ignores unknown names and tolerates transient double-subscriptions mid-upgrade (replacementBehavior STANDARD) |
