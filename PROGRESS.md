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
- [x] Prisma models (redirects, 404 events, settings) — Redirect / NotFoundEvent / ShopSettings + migration `core-models`; purge coverage extended + tested; `write_online_store_navigation` scope added
- [x] Redirect CRUD via GraphQL urlRedirect mutations (create/update/delete, paginated list, search) — mutations verified on shopify.dev 2025-10; free-cap enforcement; best-effort DB mirror; Redirects page with search + cursor pagination; unit tested
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
- **Last completed task:** Redirect CRUD — urlRedirect create/update/delete/list verified on shopify.dev 2025-10 and implemented with free-cap enforcement, best-effort DB mirror, search (literal-quoted) + cursor pagination, Redirects page with edit/two-step delete. Reviews: code approved 0 critical/high; security found 1 HIGH (protocol-relative `//host` target bypassed the scheme allowlist → open redirect) — fixed + regression tests. 61/61 tests green; typecheck/build/lint clean
- **Files created/modified this session:** app/models/plans.ts, app/models/billing.server.ts, app/models/__tests__/plans.test.ts, app/models/__tests__/billing.test.ts, app/shopify.server.ts, app/routes/app.plan.tsx, app/routes/app.tsx, PROGRESS.md, DECISIONS.md
- **Next 3 actions:**
  1. User runs `PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev` → auth, create app "pathmend" in Partner org, pick dev store, confirm embedded admin loads; then live-test plan page, Redirects CRUD, and webhook triggers
  2. 404 capture: theme app extension (app embed, <5KB, async, 404 template only) + App Proxy endpoint (dedupe by normalized path, hit counts, device type)
  3. Dashboard + 404 Log UI: "Unresolved 404s" table, one-click Create redirect (pre-filled), bulk fix, mark-ignored
- **Blockers/questions:** Store link is the only user-blocked step. Decide manual Billing API vs Managed Pricing before submission (manual implemented; switch is cheap — see DECISIONS.md 2026-08-10). `npm audit` findings in template deps parked until pre-ship audit.
