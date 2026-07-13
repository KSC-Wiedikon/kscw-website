# KSCW Website

Astro static site for KSC Wiedikon volleyball club. Directus API backend, Cloudflare Pages hosting.

## Commands
```bash
npm run dev          # local dev server (localhost:4321)
npm run build        # production build → dist/
npm run preview      # preview production build
npm test             # unit tests (vitest run)
npm run test:e2e     # e2e tests (Playwright, against `astro preview` on :4322)
npm run test:all     # vitest run && playwright test
```
CI (`.github/workflows/test.yml`) runs build + unit + e2e tests on every push to **both** `dev` and `prod`.

## Conventions

| Rule | Detail |
|------|--------|
| CSS | Custom design system in `src/styles/global.css` — **never rewrite to Tailwind** |
| i18n | Single-URL routing — one page per path. German renders at build time via `t()` (`src/lib/i18n.ts`); English is swapped in client-side by `public/js/i18n.js` using `data-i18n` attributes. Dictionaries: `public/js/i18n/{de,en}.json`. Legacy `/de/…` `/en/…` URLs 301 to the canonical path via `public/_redirects`. |
| Team data | Hybrid — build-time fetch in frontmatter via `src/lib/fetch/*` (instant-paint / no-JS fallback), refreshed client-side from Directus (`public/js/team-page.js` etc.) |
| News/events | Build-time fetch in frontmatter + runtime via Directus REST |
| Board/contacts | Static JSON in `src/data/` |
| Islands | `src/islands/` for interactivity (nav, theme, animations) |
| Output | `output: 'static'` — no SSR |
| Time & date | All dates render as `dd.mm.yyyy` (Swiss dot format), all times as 24-hour `HH:MM`. ALWAYS use `de-CH` locale in `toLocaleDateString` / `toLocaleString` regardless of UI language — `en-CH` yields slashes (`30/03/2026`), `en-US` yields `mm/dd/yy`, both inconsistent with the rest of the platform. Prefer the central `formatDate` / `formatTime` helpers in `src/lib/utils.ts` over inline calls. Same rule lives in the wiedisync repo (`INFRA.md → Time & Date Formatting`). |

## Admin Page
- `/admin` — hidden link in footer copyright text
- Auth: Directus login, but **authorization is enforced server-side** by the `/kscw/wadmin/*` endpoints — the client-side role gate (`website_admin` / `website admin` / `admin` / `administrator` / `superuser`) is cosmetic. See `SECURITY.md` before changing it.
- Sections: news, events, sponsors, registrations, mixed-tournament, scorer courses — plus a superuser-only section-grant grid
- Vanilla JS island. Quill + DOMPurify loaded via SRI-pinned CDN in `admin.astro` only; **public** pages (news body rendering) use a vendored copy at `public/js/vendor/purify.min.js` instead of the CDN

## Branches & Dev-First Workflow
Same convention as `wiedisync`:
- `dev` → commit here first; every push builds a Cloudflare Pages **preview** deploy
- `prod` → live site; merge `dev` → `prod` **only with user approval**
- CI runs the full test suite on pushes to both branches

## Deployment
Cloudflare Pages — pushes to `prod` trigger the live deploy.
- **Live domain**: `https://kscw.ch` (custom-domain cutover 2026-06-18)
- **Dev preview**: pushes to `dev` build a CF Pages preview deploy
- `kscw-website.pages.dev` 302-redirects to `https://kscw.ch` via `functions/_middleware.js` — a **time-bound** transitional measure, keep until at least 2026-07-08 (see the comment in that file before removing it)
- **Directus prod**: `https://directus.kscw.ch`
- **Directus dev**: `https://directus-dev.kscw.ch`

## Tests & Security
- **Unit**: `tests/unit/` (vitest) — i18n completeness/helpers, data integrity, scorer-courses
- **E2E**: `tests/e2e/` (Playwright, against `astro preview` on `:4322` — its own port, so a running `astro dev` on `:4321` is never silently reused) — includes `security-xss.spec.ts` and `accessibility.spec.ts` alongside admin/i18n/islands/layout/navigation specs.
  Single-URL site: specs must use canonical paths (`/club/ueber-uns`, never `/de/…` — those are Cloudflare-only 301s that `astro preview` 404s) and pick the language via `tests/e2e/helpers.ts` (`gotoWithLang` / `switchLangTo`), since Playwright's default en-US locale otherwise renders the site in English.
- **CI workflows** (`.github/workflows/`): `test.yml` (dev+prod pushes), `security-audit.yml`, `bugfix-ai.yml` + `bugfix-deploy-prod.yml` (AI bugfix pipeline)
- **`SECURITY.md`** is the security baseline (trust boundaries, `/kscw/wadmin/*` model, CSP status, audit log) — read it before touching `admin.astro` or any `public/js` form
- CSP + security headers live in `public/_headers`

## Runtime Layer
`public/js/` is a vanilla-JS runtime (no framework) covering: the i18n engine (`i18n.js` + `i18n/{de,en}.json`), forms with Cloudflare Turnstile (registration, feedback, contact, newsletter), `error-logger.js` (JSONL/Sentry telemetry), `search.js`, `scoreboard.js`, `team-page.js`.

## Build Prerequisites
- Node `>=22.12`
- Copy `.env.example` → `.env` and set `DIRECTUS_URL` (build-time Astro frontmatter fetches; defaults to the dev Directus)

## Changelog & Versioning

- **CHANGELOG.md** at repo root — update with every meaningful change
- **Changelog on site** — displayed on `/club/feedback` (single page; separate DE and EN sections in the same file, toggled client-side by the i18n engine)
- **Version** in `package.json` — bump with each changelog entry (semver: patch for fixes, minor for features, major for breaking changes)
- **At end of every session**: Ask the user "Should this commit be added to the changelog and version bumped?" before finishing. If yes, update CHANGELOG.md, the feedback page changelog sections (both DE and EN), and bump `package.json` version.

## Related
- **Wiedisync** (main KSCW platform): `github.com/Lucanepa/wiedisync`
- **Directus API**: `directus.kscw.ch`
- **Infra notes** (tokens — gitignored): `docs/infra.md`. Content predates the current deploy setup (partially Coolify-era) — for anything shared with wiedisync, `wiedisync`'s `INFRA.md` is authoritative.
