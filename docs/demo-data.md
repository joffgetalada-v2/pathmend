# Pathmend — Demo Data Plan (for screenshots & screencast)

The screenshots, feature image, and screencast all need a store that looks
*used*, not empty. This is the plan for seeding it. **The actual seed run needs
the linked dev store** (it writes NotFoundEvent/Redirect/PatternRule rows and
creates a few catalog items for the matcher) — so this is the recipe to run once
`shopify app dev` is connected, not a committed script yet.

## What to seed

### Catalog (so the migration matcher finds real matches)

A handful of demo products/collections/pages/blog posts with clean handles:
- Products: `blue-cotton-tee`, `merino-beanie`, `canvas-tote`, `ceramic-mug`
- Collections: `sale`, `new-arrivals`
- Pages: `about`, `shipping`
- Blog: `news` with a couple of posts (`launch-day`, `care-guide`)

(A few is enough — the matcher searches by handle/title; screenshots only show a
dozen rows.)

### NotFoundEvent rows (the 404 log + chart + analytics)

~40 rows for one shop, with:
- Varied normalized paths: `/products/old-blue-tee`, `/collections/clearance`,
  `/blog/2023/care-guide`, `/pages/about-us`, `/shop/mug`, etc. — a mix that the
  matcher can partially match and some it can't.
- `hits` spread from 1 to ~300 so "top missing paths" is interesting.
- `status` mix: ~24 unresolved, ~12 resolved, ~4 ignored.
- `firstSeenAt` spread across the last 30 days so the analytics day-chart has
  shape (not all on one day). This is the important one for the chart shot.
- `deviceType` mix of mobile/desktop/tablet; some referrers with real-looking
  hosts (google.com, a fake old-site domain) — no PII.

### Redirect rows (the redirects list + "redirects created" stat)

~58 redirects across sources: mostly `manual` / `not_found_fix`, some
`csv_import`, a few `migration` and `auto_heal` — so the count looks like a real
migration and the sources are represented.

### PatternRule rows (the pattern rules screenshot)

2–3 rules:
- Wildcard `/blog/*` → `/news/*`, enabled, with a non-zero "Fixes made" count.
- Regex `/p/(\d+)` → `/products/$1`, enabled.
- One disabled rule to show the toggle.

### Onboarding state

Seed at least one captured 404 AND one redirect so the onboarding checklist is
complete and hidden in the Dashboard hero shot. (If you want to screenshot the
onboarding card itself for the listing, do that on a fresh shop before seeding.)

## How to run it (once the store is linked)

Options, simplest first:
1. **Manual, in-app** — click through: enable the embed, hit some 404 URLs on
   the storefront to generate real events, create redirects, add pattern rules.
   Most authentic; slowest.
2. **A one-off seed script** — a `scripts/seed-demo.ts` that opens a Prisma
   client against the dev DB and bulk-inserts the NotFoundEvent/Redirect/
   PatternRule rows for the dev shop domain, plus a few `admin.graphql`
   productCreate/collectionCreate calls for the catalog. Fastest for repeatable
   screenshots. Build this when the store is linked (it needs the real shop
   domain + a session), then keep it out of the production build.

## Plan reminder for paid-feature shots

Migrate, Pattern rules, and Analytics gate on PRO/MIGRATION. On the dev store,
use a **test** subscription (billing test mode) so those screens render the
feature, not the upsell — test charges never bill.

## Do-not-ship

- Keep any seed script under `scripts/` and out of the app build.
- Never seed real customer data. All demo paths/referrers must be fictional.
