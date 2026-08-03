# CLAUDE CODE MASTER PROMPT — Shopify Public App: "Redirect & 404 Manager (Migration Edition)"

## 0. FIRST ACTIONS (do these before anything else, in order)
1. Confirm we are in an empty project folder (e.g., redirect-404-manager). If not empty, list contents and ask me before proceeding.
2. Save this ENTIRE prompt verbatim into a file named CLAUDE.md at the project root, so it auto-loads as project memory in every future session.
3. Create PROGRESS.md containing the full phase checklist from Section 8 (all items unchecked) plus a "Current Status" block: current phase, last completed task, next 3 actions, blockers.
4. Create DECISIONS.md (empty log: date | decision | reason).
5. Initialize git and make the first commit ("chore: project memory + progress tracker").
6. Then give me a short build plan summary (max 10 lines) and WAIT for my "go" before scaffolding any app code.

## 1. WHO YOU ARE & THE MISSION
You are my senior pair-programmer. I am a senior Shopify developer (12+ years, expert in Liquid, theme development, migrations, performance). Talk to me like a peer — concise, no beginner explanations.

We are building a production-quality PUBLIC Shopify app to submit to the Shopify App Store within ~4 weeks of part-time work (20–30 hrs/week):

APP: Redirect & 404 Manager, built for platform migrations.
- Auto-detects 404s on the storefront and lets merchants fix them in one click with 301 redirects.
- Bulk CSV import/export, wildcard/pattern rules, and a unique MIGRATION IMPORT MODE (map old WordPress/WooCommerce/BigCommerce/Magento URLs to new Shopify URLs).
- Positioning/differentiators vs competitors (SEOAnt, Doc404, Redirect Pro): redirects that NEVER silently disappear, ZERO storefront bloat/injected junk, built-in 404/redirect analytics, and first-class migration tooling.

## 2. USAGE-LIMIT PROTOCOL (CRITICAL — follow strictly)
You cannot read my Claude plan limits yourself, so use this human-in-the-loop protocol:
- At the START of every session, at EVERY phase boundary, and roughly every 45–60 minutes of active work, PAUSE and ask me: "Please run /usage and tell me your session (5-hour) % and weekly %."
- If BOTH are below 90% → continue working.
- If EITHER is 90% or above → immediately run the Checkpoint Routine (Section 3), then stop with exactly: "Checkpoint saved. Resume anytime by saying: continue".
- If I report usage at 85% or above, do NOT start any large multi-file task; choose a small task that finishes quickly, or checkpoint and stop.
- Because a session can be cut off abruptly at the limit, you must ALSO auto-checkpoint after every completed task (Section 3), so nothing is ever lost even without warning.

## 3. MEMORY, PAUSE & RESUME PROTOCOL
CHECKPOINT ROUTINE (run after EVERY completed task, at every phase boundary, and on any pause/stop):
1. Update PROGRESS.md: tick completed items; set "Current Status" (current phase, last completed task, files created/modified this session, next 3 concrete actions, open blockers/questions).
2. Commit: git add -A && git commit -m "checkpoint: <short description of what changed>"

COMMANDS I WILL USE (obey exactly):
- "pause" or "stop for today" → run Checkpoint Routine, reply with a 3-line summary of where we stopped and what happens next, then end. Do not start anything new.
- "continue" → read CLAUDE.md + PROGRESS.md + run: git log --oneline -15. Reply with a 3-line status recap ("We are in Phase X, last we finished Y, next up is Z"), then immediately resume the "next 3 actions" from PROGRESS.md. NEVER re-plan from scratch, never redo finished work.
- "status" → summarize PROGRESS.md in under 10 lines. Do not code.

## 4. TECH STACK (non-negotiable)
- Shopify CLI + the LATEST official Shopify app template (TypeScript). Embedded admin app.
- GraphQL Admin API ONLY — public apps submitted after April 1, 2025 must be GraphQL-only. Pin the latest stable API version. No REST anywhere.
- Latest App Bridge + Polaris for ALL admin UI.
- Prisma ORM. SQLite for local dev; structure code so production can switch to Postgres (Railway or Fly.io) via env var only.
- Theme app extension (app embed) for the storefront 404-capture snippet: under 5KB, async, zero layout shift, zero external dependencies, only active on the 404 template.
- Shopify Billing API for ALL charges (never Stripe/PayPal inside the app).
- When you are unsure about a current API, mutation name, or requirement, FETCH the live docs at shopify.dev and verify BEFORE implementing. Do not code from memory for Shopify APIs.

## 5. COMPLIANCE FIRST (top App Store rejection causes — build these BEFORE features)
- Auth: session tokens / managed installation, embedded app, no third-party cookies.
- Mandatory GDPR webhooks implemented and tested: customers/data_request, customers/redact, shop/redact. Plus app/uninstalled → purge that shop's data and cancel scheduled jobs.
- Billing plans wired end-to-end with plan gating middleware:
  - FREE: up to 25 active redirects + 404 detection/logging.
  - PRO $9.99/mo: unlimited redirects, wildcard/pattern rules, analytics. 7-day free trial.
  - MIGRATION $19.99/mo: everything in Pro + CSV/sitemap migration importer + priority support. 7-day free trial.
- Clean uninstall: nothing left behind (theme app extensions auto-remove; purge DB per redact rules).
- App listing rules: app name must NOT contain "Shopify"; screenshots must NOT show myshopify.com URLs or the Shopify logo.
- Performance bar (Built for Shopify targets): storefront impact ≈ 0, admin CLS < 0.1, Lighthouse-clean.

## 6. FEATURE SPEC
PHASE 2 — CORE:
- Redirect CRUD using GraphQL urlRedirect mutations (create/update/delete, paginated list, search).
- 404 capture: app-embed JS on the 404 template sends the missed path to an App Proxy endpoint → store path, referrer, hit count, first/last seen, device type. Dedupe by normalized path.
- Dashboard: "Unresolved 404s" table with one-click "Create redirect" (pre-filled modal), bulk-select fix, mark-ignored.
PHASE 3 — DIFFERENTIATORS:
- Bulk CSV import/export of redirects (validate, dry-run preview, error report). Use Shopify's bulk redirect import mutations if available (verify on shopify.dev).
- Pattern rules (wildcard + regex): since native Shopify redirects are exact-match, implement "auto-heal mode" — when a new 404 matches a saved pattern, automatically materialize a concrete redirect and log it.
- MIGRATION IMPORT MODE: (a) upload CSV of old_url,new_url; or (b) fetch old site's sitemap.xml → auto-match old slugs to current Shopify products/collections/pages/blog posts via GraphQL search → review screen with confidence scores (high/medium/low) → apply approved rows in bulk.
PHASE 4 — ANALYTICS & ALERTS:
- Dashboard charts: 404s over time, top missing paths, resolved vs unresolved, redirects created, estimated recovered visits.
- Weekly in-app digest card. (Email digests via a provider like Resend = post-launch backlog, NOT v1.)
GUARDRAIL: never route live redirects through the app proxy (latency + SEO risk). Redirects are always native Shopify urlRedirects; analytics derive from captured 404 events + redirect records.

## 7. UI/UX BAR — MAKE IT APPEALING & PROFESSIONAL
- Use Polaris components idiomatically. Clean IA with nav: Dashboard / 404 Log / Redirects / Import / Analytics / Settings & Plan.
- Beautiful empty states (icon/illustration + one-line explanation + primary action button) for every screen.
- Skeleton loaders on all data fetches; success toasts; error banners that say how to fix the problem.
- Onboarding: a 3-step checklist card on the Dashboard (1. Enable the app embed → deep-link to theme editor, 2. Auto-detect or import URLs, 3. Create your first redirect). Target time-to-first-value under 5 minutes.
- Responsive down to small screens, keyboard accessible, proper aria labels, Polaris tokens only (no hard-coded colors).
- Microcopy: plain, confident, merchant-friendly. No developer jargon in the UI.

## 8. PHASES & CHECKLIST (mirror this exactly in PROGRESS.md)
- Phase 0 — Setup: scaffold app via Shopify CLI, connect dev store, prove "shopify app dev" runs, commit.
- Phase 1 — Compliance skeleton: session-token auth, GDPR webhooks (+ test each), app/uninstalled cleanup, Billing plans + gating, plan page.
- Phase 2 — Core: Prisma models, redirect CRUD, 404 capture embed + proxy endpoint, Dashboard + 404 Log UI.
- Phase 3 — Differentiators: CSV import/export, pattern rules + auto-heal, migration importer + matcher + review UI.
- Phase 4 — Analytics dashboard + weekly digest card.
- Phase 5 — Polish: onboarding checklist, empty states, perf pass, accessibility pass, microcopy pass.
- Phase 6 — Ship: seed demo data in dev store; write listing copy draft + screenshot shot-list; record-screencast script; full self-audit against Shopify's App Requirements Checklist; fix findings; prepare submission.
DEFINITION OF DONE (v1): Phases 0–6 complete, zero console errors, install → configure → uninstall → reinstall tested clean, billing upgrade/downgrade/trial tested, storefront perf impact ≈ 0.

## 9. WORKING RULES
- For every task: brief plan first (3–6 bullets) → implement in small verifiable increments → run/test → Checkpoint Routine.
- TypeScript strict mode. Handle GraphQL userErrors on every mutation. Respect rate limits with retry/backoff.
- Ask before: deleting files, resetting the DB/schema, force-pushing, or anything that touches my dev store's live data.
- Prefer boring, maintainable code over clever code. Comment the "why", not the "what".
- Log every non-obvious choice in DECISIONS.md.
- Never fabricate a Shopify API. If uncertain, check shopify.dev first.

## 10. START NOW
Acknowledge this spec in 5 lines or fewer, execute Section 0 (First Actions), then propose the Phase 0 + Phase 1 task list and WAIT for my "go".
