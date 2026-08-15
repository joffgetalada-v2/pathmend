# Pathmend — App Store Listing Copy (draft)

Draft for the Shopify App Store listing. Fill the Partner Dashboard fields from
these. Screenshots/icon/feature image are produced separately (see
`screenshot-shotlist.md`). Nothing here may contain "Shopify", a myshopify.com
URL, or the Shopify logo.

---

## App name (max 30 chars)

**Pathmend — Redirect & 404 Manager** (29 chars, incl. spaces)

Alternatives if the above is taken:
- **Pathmend Redirects & 404s** (25)
- **Pathmend — 404 & Redirects** (26)

> Rule: name must start with the brand ("Pathmend"), ≤30 chars, no "Shopify".

## Tagline / short description (one line)

Fix broken links and 404s in one click — built for store migrations.

## Introduction (the "app card" blurb, ~100 chars)

Catch every 404, redirect it in one click, and migrate a whole store's old URLs
without losing traffic or SEO.

---

## Full description

**Never lose a visitor to a dead link again.**

Pathmend automatically catches the 404s happening on your storefront and lets
you fix each one with a proper 301 redirect — in a single click. It's built for
the moment that breaks the most links: migrating to Shopify from WordPress,
WooCommerce, BigCommerce, or Magento.

**What you get**

- **Automatic 404 detection.** A lightweight tracker finds broken links as real
  visitors hit them — no manual crawling. See the path, how many hits it's
  getting, where visitors came from, and what device they're on.
- **One-click fixes.** Turn any 404 into a 301 redirect from the log, or fix a
  whole batch at once. Every redirect is a native Shopify redirect — fast, and
  it never silently disappears.
- **Migration importer.** Bring your old site's URLs in by CSV or by pointing
  Pathmend at its sitemap. It matches each old URL to the right product,
  collection, page, or blog post and scores its confidence so you can review
  before anything goes live.
- **Pattern rules & auto-heal.** Redirect whole families of URLs with one
  wildcard or regex rule (like `/blog/*` → `/news/*`). When a new 404 matches a
  rule, Pathmend creates the exact redirect for it automatically.
- **Bulk CSV import & export.** Move redirects in and out in bulk, with a
  dry-run preview and a clear report of anything that needs attention.
- **Analytics that matter.** 404s over time, your most-missed URLs, resolved vs.
  unresolved, and an estimate of the visits you've recovered.

**Why Pathmend**

- **Real redirects that never vanish.** Every redirect is a genuine Shopify
  301 — never a client-side script, never routed through the app. No added
  latency, no SEO risk, and nothing that quietly stops working.
- **No false alarms.** Pathmend only logs pages your store actually served as
  a 404 — it can't mistake a language route or a live page for a broken link,
  and it never creates a redirect you didn't approve.
- **Zero storefront bloat.** The tracker is tiny, loads asynchronously, runs
  only on 404 pages, and adds no external requests. Uninstalling removes it
  completely.
- **Built for migrations.** Point Pathmend at your old site's sitemap (or a
  CSV) and it matches every old URL to the right product, collection, page,
  or post — with a confidence score on each match, so you review before
  anything goes live.
- **Honest pricing.** Flat plans, and 404 detection is never metered — no
  per-error quotas, no surprise usage charges, on any plan including Free.

**Plans**

- **Free** — up to 25 active redirects, plus automatic 404 detection and
  logging.
- **Pro** — unlimited redirects, wildcard/pattern rules with auto-heal, and
  analytics.
- **Migration** — everything in Pro, plus the CSV & sitemap migration importer
  and priority support.

Paid plans include a 7-day free trial. Downgrading never deletes the redirects
you've already created.

---

## Feature bullets (for the listing's feature list — keep concise, no keyword stuffing)

- Automatic 404 detection with hit counts, referrers, and device type — unmetered on every plan
- One-click and bulk 301 redirects — always native Shopify redirects, never client-side scripts
- Migration importer: CSV or sitemap → smart, confidence-scored matches you review before applying
- Wildcard & regex pattern rules with auto-heal that creates real, visible redirects
- Bulk CSV import/export with dry-run preview and a per-row error report
- 404 & redirect analytics with recovered-visit estimates

---

## Pricing section (Partner Dashboard "Pricing" content)

| Plan | Price | Includes |
|------|-------|----------|
| Free | $0/mo | Up to 25 active redirects, automatic 404 detection & logging, one-click fixes |
| Pro | $9.99/mo | Everything in Free, unlimited redirects, wildcard/pattern rules with auto-heal, analytics. 7-day free trial |
| Migration | $19.99/mo | Everything in Pro, CSV & sitemap migration importer, priority support. 7-day free trial |

> All charges shown here only. No hidden fees, no post-purchase upsells.

---

## Privacy policy (required) — pointers

The listing requires a public privacy policy URL. It must state:
- Pathmend stores 404 event data (requested path, referrer, coarse device type)
  and redirect records, scoped per shop.
- It stores **no** Shopify customer PII — the GDPR customer webhooks are
  no-ops because there's nothing customer-linked to return or redact.
- On app uninstall or shop redaction, all shop data is purged.

(Referrers can incidentally contain a URL a third party placed there; documented
in DECISIONS.md, out of scope for the customer-data webhooks since it's not
linked to a Shopify customer.)

---

## Support & contact

- Support email: (to fill — the merchant-facing address)
- Response time: Pro/Migration get priority.

## Notes for the submitter

- Do NOT use any myshopify.com URL anywhere in the listing.
- Do NOT show the Shopify logo or the word "Shopify" in the app name.
- Screenshots must have no browser chrome, no PII, no pricing, no myshopify URLs
  (see `screenshot-shotlist.md`).
