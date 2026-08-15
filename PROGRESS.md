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
- [x] Onboarding 3-step checklist card (app embed deep-link → detect/import → first redirect) — evidence-based completion (captured 404 → embed live; redirect → first value); theme-editor deep-link with graceful fallback; shown only while incomplete; unit tested
- [x] Empty states for every screen — audited all 8 routes; jargon-in-empty-states fixed ("app embed"/"capture embed" → "404 tracking")
- [ ] Performance pass (storefront ≈ 0, admin CLS < 0.1, Lighthouse-clean) — needs running store (deferred until store link)
- [ ] Accessibility pass (keyboard, aria, responsive) — needs browser (deferred until store link)
- [x] Microcopy pass (merchant-friendly, no jargon) — agent audit → applied high-impact fixes: unified "broken link" vocabulary, killed internal terms (app embed/capture embed/auto-heal-as-"healed"), natural pluralization (pluralize helper), capitalized enum badges, actionable dead-end messages, SitemapUrlError so only merchant-safe errors surface. Declined spec-defined names (Settings & Plan, Pattern rules) per CLAUDE.md §7 IA

### Phase 6 — Ship
- [~] Seed demo data in dev store — plan written (docs/demo-data.md); actual seed run needs the store link
- [x] Listing copy draft + screenshot shot-list — docs/listing-copy.md + docs/screenshot-shotlist.md (App Store rules applied: ≤30-char name, no Shopify/myshopify/PII)
- [x] Screencast script — docs/screencast-script.md (~90s walkthrough)
- [x] Full self-audit vs Shopify App Requirements Checklist — docs/self-audit.md; verdict: no security/compliance code defects, blockers are config + live checks
- [x] Fix audit findings (code/content) — real splash copy, deleted app.additional.tsx, real README, env-driven DATABASE_URL + .env.example. Remaining must-fixes are config-only (config link, proxy url, provider swap) — need the store/deploy
- [ ] Prepare submission — needs store link (config link, live verification, assets from the shot-list/screencast)

### Definition of Done (v1)
- [ ] Phases 0–6 complete
- [ ] Zero console errors
- [ ] Install → configure → uninstall → reinstall tested clean
- [ ] Billing upgrade/downgrade/trial tested
- [ ] Storefront perf impact ≈ 0

## Current Status
- **Current phase:** Phase 6 — Ship: no-store deliverables DONE (listing copy, screenshot shot-list, screencast script, demo-data plan, self-audit + code/content fixes). Everything code-verifiable across Phases 0–6 is complete. Remaining work ALL needs the dev-store link: config link, live verification (install/uninstall/billing/GDPR/perf/a11y), demo-data seed, asset capture, submission.
- **Maintenance (2026-08-15):** Disabled the 7 Shopify template-repo workflows inherited at scaffold (CLA/stale-issue bots, Gardener triage, JS-branch converter) — they were failing on GitHub and emailing the user; slimmed ci.yml to one Node-22/npm job (prisma validate → typecheck → lint → test → build), verified green locally. Follow-up same day: gardener-investigate-issue.yml was invalid YAML since scaffold (unindented shell continuation lines inside run:|), so GitHub emitted a path-named "No jobs were run" failure on EVERY push regardless of triggers — repaired via one-line printf; all 8 workflow files parse now. Second follow-up: first real CI run failed at `prisma validate` (clean checkout has no .env → no DATABASE_URL); added job-level DATABASE_URL to ci.yml, full pipeline verified green in a pristine clone. See DECISIONS.md 2026-08-15.
- **Research-driven backlog (2026-08-16, from docs/competitive-research.md):**
  - QUICK WINS — DONE 2026-08-16: redirect chain detection on create/update (advisory GraphQL lookup, fails open, actionable error naming the final destination; +5 tests, 279 total green); listing-copy sharpened with evidence-backed differentiators (real-301s-never-JS, zero false positives by construction, unmetered 404 logging, flat pricing, migration matcher described as smart/confidence-scored — NOT branded "AI" since the matcher is heuristic; revisit if an ML matcher ships)
  - v1.1 FAST-FOLLOWS: delete/rename watchdog (products+collections webhooks, suggest-not-auto; store last-known handles — no previous_handle in payloads, no pages/blogs topics); email alerts + email digest (raise from post-launch: 5/8 competitors have it); live path suggestions in create-redirect modal (reuse migration matcher); native bulk import via urlRedirectImportCreate/Submit + redirectLimitReached preflight; annual billing option
  - POST-LAUNCH: GSC integration (import known 404s); store-wide broken-link crawler (decide on traction); review-velocity plan + Built for Shopify badge audit (visibility gate: 10/10 top apps have BFS)
  - WON'T DO (logged in DECISIONS.md): live/active-page redirects; usage-metered pricing
- **Last completed task:** Phase 6 no-store deliverables — docs/ (listing-copy, screenshot-shotlist, screencast-script, demo-data, self-audit); pre-submission self-audit (no security/compliance code defects). Applied audit code/content fixes: real splash copy, deleted template app.additional.tsx, real README, env-driven DATABASE_URL + committable .env.example. 274/274 tests green; typecheck/build/lint clean
- **Files created/modified this session:** app/models/{plans.ts,billing.server.ts,redirects.ts,redirects.server.ts,not-found.server.ts,device.ts,rate-limit.server.ts,purge.server.ts} + __tests__, app/routes/{app.plan.tsx,app.redirects.tsx,proxy.404.tsx,app.tsx} + __tests__, app/shopify.server.ts, prisma/schema.prisma (+migration), extensions/notfound-capture/*, shopify.app.toml, PROGRESS.md, DECISIONS.md
- **Next 3 actions (per the 2026-08-16 ship-first decision — see DECISIONS.md):**
  1. USER: run `PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev` → auth, create app "pathmend" in Partner org, pick dev store (the only user-blocked step; everything else queues behind it)
  2. Live verification on the dev store (install → configure → uninstall → reinstall, billing upgrade/downgrade/trial, GDPR webhooks, storefront perf, a11y spot-check) + demo-data seed + screenshot/screencast capture → submit to the App Store
  3. WHILE IN REVIEW (v1.1 queue, in order): email digest/alerts via provider; in-app review prompt after value moments (review velocity = the visibility lever); annual billing (~17% off convention). Post-approval flagship: delete/rename watchdog, then GSC integration + Built for Shopify badge audit
- **Cleanup queue (needs user OK):** delete the 7 disabled template workflows outright — .github/workflows/{cla, close-waiting-for-response-issues, gardener-investigate-issue, gardener-notify-event, gardener-notify-slack, remove-labels-on-activity, update-javascript-branch}.yml + .github/CODEOWNERS (all inert since 2026-08-15, kept only pending delete approval). Optional: CONTRIBUTING.md / ISSUE_TEMPLATE.md / CODE_OF_CONDUCT.md still carry Shopify's template wording. (app/routes/app.additional.tsx already deleted 2026-08-11.)
- **Blockers/questions:** Store link is the only user-blocked step. Decide manual Billing API vs Managed Pricing before submission (manual implemented; switch is cheap — see DECISIONS.md 2026-08-10). `npm audit` findings in template deps parked until pre-ship audit.
