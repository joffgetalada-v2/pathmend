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
- [ ] Billing plans (FREE / PRO $9.99 / MIGRATION $19.99, 7-day trials)
- [ ] Plan gating middleware
- [ ] Plan page (Settings & Plan)

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
- **Current phase:** Phase 1 — Compliance skeleton (GDPR webhooks done; billing next). Phase 0 store link still pending user.
- **Last completed task:** GDPR compliance webhooks — toml subscriptions + 3 route handlers + idempotent purgeShopData shared with hardened app/uninstalled; vitest set up; 8/8 unit tests green; typecheck + build clean; code review passed (0 critical/high)
- **Files created/modified this session:** shopify.app.toml, app/models/purge.server.ts, app/routes/webhooks.customers.data_request.tsx, app/routes/webhooks.customers.redact.tsx, app/routes/webhooks.shop.redact.tsx, app/routes/webhooks.app.uninstalled.tsx, app/routes/__tests__/webhooks.compliance.test.ts, package.json (vitest)
- **Next 3 actions:**
  1. User runs `PATH=/usr/local/opt/node@22/bin:$PATH shopify app dev` → auth, create app "pathmend" in Partner org, pick dev store, confirm embedded admin loads (closes Phase 0; also enables live webhook trigger tests)
  2. Billing: verify current Billing API GraphQL mutations on shopify.dev, then implement 3 plans + 7-day trials + plan gating middleware
  3. Settings & Plan page (Polaris) wired to billing state
- **Blockers/questions:** Store link is the only user-blocked step; everything else proceeds. `npm audit` findings in template deps parked until pre-ship audit.
