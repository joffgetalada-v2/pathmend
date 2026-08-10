# Pathmend — Screenshot Shot-List

For the App Store listing. **3–6 screenshots**, each **1600×900px (16:9)**.
Hard rules per Shopify: no browser chrome, no PII, no pricing in the image, no
myshopify.com URLs visible, no Shopify logo. Capture from the embedded admin
with demo data seeded (see `demo-data.md` once written / the Phase 6 seed step).

Each shot below: what to show, the demo state to set up, and a one-line caption
overlay (optional but recommended — high contrast, ≥4.5:1).

---

## 1. Dashboard — "See every broken link at a glance" (hero shot)

- **Screen:** `/app` (Dashboard) with data seeded so the stat cards show real
  numbers (e.g. 24 unresolved, 61 resolved, 58 redirects) and the "Latest
  unresolved 404s" table has 5 rows.
- **State:** onboarding card hidden (seed a redirect + a captured 404 so
  onboarding is complete), weekly digest card visible with activity.
- **Caption:** "Catch 404s automatically and see what needs fixing."

## 2. 404 Log — "Fix broken links in one click" (core value)

- **Screen:** `/app/notfound`, Unresolved tab, 8–12 rows with varied paths, hit
  counts, referrer hosts, device types.
- **State:** hover/opened the inline "Fix" flow on one row so the pre-filled
  redirect form is visible (shows the one-click nature). A couple of rows
  selected to hint at bulk fix.
- **Caption:** "One click turns a 404 into a 301 redirect."

## 3. Migration importer — "Move a whole store's URLs" (differentiator)

- **Screen:** `/app/migrate` review table after a match run — rows with Old URL,
  Matched to (product/collection/page), and confidence badges (mix of High /
  Medium / Low), most High/Medium pre-approved.
- **State:** MIGRATION plan active so the feature (not the upsell) renders.
- **Caption:** "Match old URLs to your new store — review before you apply."

## 4. Pattern rules & auto-heal — "Fix families of URLs" (differentiator)

- **Screen:** `/app/patterns` with 2–3 rules in the table (a wildcard
  `/blog/*` → `/news/*` and a regex), the "Fixes made" column showing counts,
  and the live preview field showing "Would redirect to /news/my-post".
- **State:** PRO or MIGRATION plan.
- **Caption:** "One rule redirects every matching link — automatically."

## 5. Analytics — "Know what you've recovered" (retention/value)

- **Screen:** `/app/analytics` with the day-chart populated (30 days of bars),
  summary cards (unresolved/resolved/redirects/recovered visits with the %),
  and the top-missing-paths table.
- **State:** PRO or MIGRATION plan, ~30 days of seeded events.
- **Caption:** "Track 404s over time and the visits you've won back."

## 6. (Optional) Redirects list — "All your redirects, searchable"

- **Screen:** `/app/redirects` with a full table, the search box, and the
  Export/Import/Pattern-rules buttons.
- **Caption:** "Every redirect in one place — import, export, search."

---

## Capture checklist

- [ ] Seed demo data first so no screen is empty.
- [ ] Set the plan per shot (some show paid-only features — use a test
      subscription; the app's `BILLING_TEST_MODE`/dev store makes this free).
- [ ] Crop to exactly 1600×900, no browser chrome (use the embedded-admin frame
      only, or crop it out).
- [ ] Scrub any myshopify.com URL from the visible admin frame.
- [ ] Verify captions meet 4.5:1 contrast on their background.
- [ ] No real customer names/emails in any referrer or path — use demo values.

## Feature image (separate asset)

- **1600×900**, simple focal point, one clear message. Suggested: the Pathmend
  wordmark + "Fix broken links. Recover lost visitors." on a bold background,
  with a stylized 404→301 motif. No screenshots inside the feature image, no
  Shopify branding.

## App icon (separate asset)

- **1200×1200**, JPEG/PNG, bold colors, **no text, no screenshot**. Suggested: a
  mended-path / bent-arrow mark (a broken line rejoining) in the brand color.
