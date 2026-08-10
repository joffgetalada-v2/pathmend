# PROGRESS — Redirect & 404 Manager (Migration Edition)

## Phase Checklist

### Phase 0 — Setup
- [x] Scaffold app via Shopify CLI (latest official TypeScript template) — cloned shopify-app-template-react-router; deps installed; prisma migrated; build green
- [ ] Connect dev store
- [ ] Prove `shopify app dev` runs
- [x] Commit

### Phase 1 — Compliance skeleton
- [ ] Session-token auth (embedded, managed installation, no third-party cookies) — template provides it; verify live once dev store linked
- [x] GDPR webhook: customers/data_request (+ unit tested; live `webhook trigger` test pending store link)
- [x] GDPR webhook: customers/redact (+ unit tested; live test pending store link)
- [x] GDPR webhook: shop/redact (+ unit tested; live test pending store link)
- [x] app/uninstalled → purge shop data via idempotent purgeShopData (+ unit tested; no scheduled jobs exist yet — revisit when jobs land)
- [x] Billing plans (FREE / PRO $9.99 / MIGRATION $19.99, 7-day trials) — manual Billing API via package `billing` config; verified non-deprecated on 2025-10; live approve/cancel flow test pending store link
- [x] Plan gating middleware — `requireFeature(billing, feature)` + `activeRedirectLimit`; unit tested; wire into feature routes as they land in Phases 2–3
- [x] Plan page (Settings & Plan) — 3 plan cards, subscribe/cancel actions, nav link; visual check pending store link

### Phase 2 — Core
- [ ] Prisma models (redirects, 404 events, settings)
- [ ] Redirect CRUD via GraphQL urlRedirect mutations (create/update/delete, paginated list, search)
- [ ] 404 capture app embed (<5KB, async, zero layout shift, 404 template only)
- [ ] App Proxy endpoint (store path, referrer, hit count, first/last seen, device type; dedupe by normalized path)
- [ ] Dashboard: "Unresolved 404s" table + one-click Create redirect (pre-filled modal)
- [ ] Bulk-select fix + mark-ignored
- [ ] 404 Log UI

### Phase 3 — Differentiators
- [ ] Bulk CSV import/export (validate, dry-run preview, error report)
- [ ] Verify Shopify bulk redirect import mutations on shopify.dev
- [ ] Pattern rules (wildcard + regex)
- [ ] Auto-heal mode (404 matches pattern → materialize concrete redirect + log)
- [ ] Migration import: CSV old_url,new_url
- [ ] Migration import: sitemap.xml fetch + auto-match via GraphQL search
- [ ] Review screen with confidence scores (high/medium/low)
- [ ] Bulk apply approved rows

### Phase 4 — Analytics & alerts
- [ ] Charts: 404s over time, top missing paths, resolved vs unresolved, redirects created, estimated recovered visits
- [ ] Weekly in-app digest card

### Phase 5 — Polish
- [ ] Onboarding 3-step checklist card (app embed deep-link → detect/import → first redirect)
- [ ] Empty states for every screen
- [ ] Performance pass (storefront ≈ 0, admin CLS < 0.1, Lighthouse-clean)
- [ ] Accessibility pass (keyboard, aria, responsive)
- [ ] Microcopy pass (merchant-friendly, no jargon)

### Phase 6 — Ship
- [ ] Seed demo data in dev store
- [ ] Listing copy draft + screenshot shot-list
- [ ] Screencast script
- [ ] Full self-audit vs Shopify App Requirements Checklist
- [ ] Fix audit findings
- [ ] Prepare submission

### Definition of Done (v1)
- [ ] Phases 0–6 complete
- [ ] Zero console errors
- [ ] Install → configure → uninstall → reinstall tested clean
- [ ] Billing upgrade/downgrade/trial tested
- [ ] Storefront perf impact ≈ 0

## Current Status
- **Current phase:** Phase 1 — Compliance skeleton (GDPR webhooks + billing/gating/plan page done in code). Phase 0 store link still pending user.
- **Last completed task:** Billing — verified on shopify.dev that manual Billing API is non-deprecated on 2025-10 (Managed Pricing is now Shopify's recommended default for new apps — logged in DECISIONS.md, revisit before submission); implemented plans module + billingConfig (Pro $9.99 / Migration $19.99, 7-day trials) + `requireFeature` gating + Settings & Plan page. Code review: approved, 0 critical/high. Security review found 1 CRITICAL (SDK defaults `billing.check` to `isTest: true` → test subscriptions would count as paid in production) — fixed with explicit `isTest: isBillingTest()` + plans filter + regression tests. 33/33 unit tests green; typecheck/build/lint clean
- **Files created/modified this session:** app/models/plans.ts, app/models/billing.server.ts, app/models/__tests__/plans.test.ts, app/models/__tests__/billing.test.ts, app/shopify.server.ts, app/routes/app.plan.tsx, app/routes/app.tsx, PROGRESS.md, DECISIONS.md
- **Next 3 actions:**
  1. User runs `PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev` → auth, create app "pathmend" in Partner org, pick dev store, confirm embedded admin loads + plan page renders + test-mode subscribe/cancel round-trip (closes Phase 0, verifies Phase 1 live)
  2. Phase 2 start: Prisma models (Redirect, NotFoundEvent, ShopSettings) + migration
  3. Redirect CRUD via GraphQL urlRedirect mutations (create/update/delete, paginated list, search) with userErrors handling
- **Blockers/questions:** Store link is the only user-blocked step. Decide manual Billing API vs Managed Pricing before submission (manual implemented; switch is cheap — see DECISIONS.md 2026-08-10). `npm audit` findings in template deps parked until pre-ship audit.
