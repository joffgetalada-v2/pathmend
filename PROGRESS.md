# PROGRESS — Redirect & 404 Manager (Migration Edition)

## Phase Checklist

### Phase 0 — Setup
- [ ] Scaffold app via Shopify CLI (latest official TypeScript template)
- [ ] Connect dev store
- [ ] Prove `shopify app dev` runs
- [ ] Commit

### Phase 1 — Compliance skeleton
- [ ] Session-token auth (embedded, managed installation, no third-party cookies)
- [ ] GDPR webhook: customers/data_request (+ tested)
- [ ] GDPR webhook: customers/redact (+ tested)
- [ ] GDPR webhook: shop/redact (+ tested)
- [ ] app/uninstalled → purge shop data + cancel scheduled jobs (+ tested)
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
- **Current phase:** Pre-Phase 0 (project memory initialized)
- **Last completed task:** Section 0 First Actions — CLAUDE.md, PROGRESS.md, DECISIONS.md created; first commit made
- **Files created/modified this session:** CLAUDE.md, PROGRESS.md, DECISIONS.md
- **Next 3 actions:**
  1. Get "go" from user, then scaffold app via Shopify CLI (latest official TS template)
  2. Connect dev store and verify `shopify app dev` runs end-to-end
  3. Commit scaffold and begin Phase 1 (GDPR webhooks + auth verification)
- **Blockers/questions:** Awaiting "go"; need dev store handy for Phase 0
