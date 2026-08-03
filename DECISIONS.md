# Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-08-04 | React Router template (shopify-app-template-react-router), not Remix | shopify.dev now marks it "the recommended path for most apps"; TS + Prisma/SQLite built in; API version pinned 2025-10 |
| 2026-08-04 | Scaffolded via direct git clone instead of `shopify app init` | CLI 3.84 forces interactive Shopify auth during init (creates the app in the Partner org up front); clone is deterministic, app link happens at first `shopify app dev` |
| 2026-08-04 | Run node via `/usr/local/opt/node@22/bin` (22.23.1) PATH prefix | Default node 22.9.0 falls inside template's excluded engine range (`>=22 <22.12`); didn't relink system node without asking |
| 2026-08-04 | Kept template's AGENTS.md, dropped its CLAUDE.md | Our CLAUDE.md is the project master prompt; AGENTS.md carries the same Shopify AI Toolkit pointer |
| 2026-08-04 | Commit package-lock.json (template gitignores it) | Template stays package-manager-agnostic; we're npm-only and want reproducible installs for CI/Docker |
