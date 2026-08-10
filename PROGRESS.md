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
- [x] 404 capture app embed (<5KB, async, zero layout shift, 404 template only) — inline ~0.4KB sendBeacon in theme app embed; design-mode skipped; live theme test pending store link
- [x] App Proxy endpoint (store path, referrer, hit count, first/last seen, device type; dedupe by normalized path) — /proxy/404 with signature auth, per-shop rate limit, capture toggle honored; unit tested
- [x] Dashboard: "Unresolved 404s" table + one-click Create redirect (pre-filled modal) — Dashboard stat cards + latest-unresolved list; one-click Fix pre-fills the path in the 404 Log fix card
- [x] Bulk-select fix + mark-ignored — row checkboxes, bulk fix to one target (stops at plan cap), ignore/restore, tenant-scoped
- [x] 404 Log UI — status tabs with counts, path search, offset pagination, per-row fix

### Phase 3 — Differentiators
- [x] Bulk CSV import/export (validate, dry-run preview, error report) — Import page (preview → apply, per-row errors, 500-row cap, plan-cap aware) + CSV export (all shop redirects, formula-guarded); unit tested
- [x] Verify Shopify bulk redirect import mutations on shopify.dev — urlRedirectImportCreate/Submit exist on 2025-10; per-row chosen for v1 (see DECISIONS.md)
- [x] Pattern rules (wildcard + regex) — PatternRule model + pure matcher engine (full-path, case-insensitive, ReDoS-guarded regex) + PRO-gated rules page with live preview; unit tested (20 matcher tests)
- [x] Auto-heal mode (404 matches pattern → materialize concrete redirect + log) — wired into the capture endpoint; lazy per-match plan check; rule hit stats; beacon can never break
- [x] Migration import: CSV old_url,new_url — old-URL extraction from CSV upload → match via GraphQL search
- [x] Migration import: sitemap.xml fetch + auto-match via GraphQL search — SSRF-hardened fetch (per user), parse <loc> URLs, batch-match
- [x] Review screen with confidence scores (high/medium/low) — per-row approve checkboxes, default-approve high/medium, badges
- [x] Bulk apply approved rows — createRedirect source "migration", plan-cap aware; unit tested

### Phase 4 — Analytics & alerts
- [x] Charts: 404s over time, top missing paths, resolved vs unresolved, redirects created, estimated recovered visits — PRO-gated Analytics page, inline SVG bar chart (no chart lib), summary cards + top-paths table; unit tested. Note: "over time" buckets by firstSeenAt (we store deduped rows, not per-hit timestamps) — documented approximation
- [x] Weekly in-app digest card — trailing-7-day "This week" card on Dashboard (new 404s / redirects created / recovered visits); shown only when there's activity. Email digests are post-launch backlog per spec

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
- **Current phase:** Phase 4 — Analytics & alerts: CODE-COMPLETE (analytics page + weekly digest card, reviewed). Phases 1–4 fully implemented. Live verification of everything still pending the store link (user). Next: Phase 5 polish.
- **Last completed task:** Phase 4 analytics — PRO-gated Analytics page (summary cards, inline-SVG day chart, top-paths table) + weekly digest card on the free Dashboard. Reviews: security clean (tenant isolation, plan gate before load, attacker paths render as escaped text and never reach the SVG chart); code review 0 crit/high with 1 MEDIUM (unbounded findMany) — fixed by moving aggregates to a DB groupBy + bounding the window fetch (take 5000), which also made status counts exact over all history. 259/259 tests green; typecheck/build/lint clean
- **Files created/modified this session:** app/models/{plans.ts,billing.server.ts,redirects.ts,redirects.server.ts,not-found.server.ts,device.ts,rate-limit.server.ts,purge.server.ts} + __tests__, app/routes/{app.plan.tsx,app.redirects.tsx,proxy.404.tsx,app.tsx} + __tests__, app/shopify.server.ts, prisma/schema.prisma (+migration), extensions/notfound-capture/*, shopify.app.toml, PROGRESS.md, DECISIONS.md
- **Next 3 actions:**
  1. User runs `PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev` → auth, create app "pathmend" in Partner org, pick dev store; then live-test the full Phase 1–2 surface (embedded admin, plan page, Redirects, 404 Log, capture beacon on the dev store's 404 page, webhook triggers)
  2. Migration importer (MIGRATION-gated): CSV old_url,new_url OR sitemap.xml fetch → auto-match old slugs to Shopify products/collections/pages/blog posts via GraphQL search → confidence-scored review screen (high/medium/low) → bulk-apply approved rows
  3. Phase 4: analytics dashboard (404s over time, top paths, resolved vs unresolved, recovered visits) + weekly in-app digest card
- **Cleanup queue (needs user OK):** delete orphaned app/routes/app.additional.tsx (template leftover, no longer linked in nav)
- **Blockers/questions:** Store link is the only user-blocked step. Decide manual Billing API vs Managed Pricing before submission (manual implemented; switch is cheap — see DECISIONS.md 2026-08-10). `npm audit` findings in template deps parked until pre-ship audit.
