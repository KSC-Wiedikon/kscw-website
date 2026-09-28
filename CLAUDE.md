# KSCW Website

Astro static site for KSC Wiedikon volleyball club. Directus API backend, Cloudflare Pages hosting.

## No VolleyManager credentials here — deliberately

This site only *links* to volleyball.ch and reads league/team data through Directus.
It holds no VolleyManager login and must not get one.

There is exactly ONE VolleyManager account, shared by **wiedisync** and **svrz_rc**,
and VM keeps the active role per *account* rather than per session — so a third
consumer switching roles would make the other two read under the wrong role, which
for club-scoped resources returns a 200 with the **wrong rows** rather than an error.

If this site ever genuinely needs VolleyManager data, get it from Directus (which
wiedisync already syncs) rather than logging in here. If that is somehow impossible,
read the window tables in `~/repos/wiedisync/INFRA.md` and
`~/repos/svrz_rc/infrastructure.md` first, and add your window to **both** of them.

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
| i18n | Single-URL routing — one page per path. German renders at build time via `t()` (`src/lib/i18n.ts`); English is swapped in client-side by `public/js/i18n.js` using `data-i18n` attributes. Dictionaries: `public/js/i18n/{de,en}.json`. Admin edits from `/admin` → Seitentexte are layered on top of these: baked into the build by `scripts/fetch-site-text.mjs` (a `prebuild` step) and applied in the browser by `i18n.js`, so an edit shows up without a rebuild. Render German through `t(locale, 'key')` — never a hardcoded literal next to a `data-i18n` attribute, or the override cannot reach the build output (`tests/unit/site-text.test.ts` enforces this). Legacy `/de/…` `/en/…` URLs 301 to the canonical path via `functions/_middleware.js`. |
| Team data | Hybrid — build-time fetch in frontmatter via `src/lib/fetch/*` (instant-paint / no-JS fallback), refreshed client-side from Directus (`public/js/team-page.js` etc.) |
| News/events | Build-time fetch in frontmatter + runtime via Directus REST |
| Board/contacts | Static JSON in `src/data/` |
| Islands | `src/islands/` for interactivity (nav, theme, animations) |
| Output | `output: 'static'` — no SSR |
| Time & date | All dates render as `dd.mm.yyyy` (Swiss dot format), all times as 24-hour `HH:MM`. ALWAYS use `de-CH` locale in `toLocaleDateString` / `toLocaleString` regardless of UI language — `en-CH` yields slashes (`30/03/2026`), `en-US` yields `mm/dd/yy`, both inconsistent with the rest of the platform. Prefer the central `formatDate` / `formatTime` helpers in `src/lib/utils.ts` over inline calls. Same rule lives in the wiedisync repo (`INFRA.md → Time & Date Formatting`). |

## Admin Page
- `/admin` — hidden link in footer copyright text
- Auth: Directus login, but **authorization is enforced server-side** by the `/kscw/wadmin/*` endpoints — the client-side role gate (`website_admin` / `website admin` / `admin` / `administrator` / `superuser`) is cosmetic. See `SECURITY.md` before changing it.
- Sections: news, events, sponsors, registrations, mixed-tournament, scorer courses, **Seitentexte** (page text) — plus a superuser-only section-grant grid
- **Seitentexte** edits any `data-i18n` string on the public site. The repo dictionaries stay the source of truth; Directus `site_text` holds overrides only, and deleting one restores the shipped wording. The page list is derived at build time from the page sources (`src/pages/site-text-manifest.json.ts`), so it never needs hand-maintaining. Values are text-only by design — read `SECURITY.md` (2026-08-11) before touching any of it
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
- `functions/_middleware.js` serves the legacy `/de/…` `/en/…` 301s (moved out of `public/_redirects` 2026-09-28 — a `/:splat` rule was an open redirect via `/de//evil.example`). `public/_routes.json` limits Functions to `/de`, `/de/*`, `/en`, `/en/*`; never add a `/de` or `/en` rule to `_redirects` (Cloudflare skips it for Function-served paths). The old `kscw-website.pages.dev` → `kscw.ch` 302 was removed with it (its window closed 2026-07-08)
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

### Load order — five rules that were expensive to find (2026-08-12, rule 5 2026-09-28)
An audit measured an English visitor reading a complete German page for **1.7–2.7 s**, and a CLS of **0.95** on team pages. Both were ordering, not speed. Undoing any of these brings them straight back:

1. **The dictionary request is issued by the inline pre-paint script at the top of `BaseLayout.astro`'s `<head>`**, and handed to `i18n.js` via `window.__I18N_PRE`. It must not move behind a DOM event or below another blocking script — it was `DOMContentLoaded`-gated, which put it after the whole document. Request time: 2250 ms → 175 ms.
2. **Await `i18nReady` before RENDERING, never before FETCHING.** Nothing in Directus depends on the language, so chaining serialises two independent round trips. Use `Promise.all([payload, i18nReady])`.
3. **Anything a page script writes gets a `data-i18n` key on the node**, not just translated text (`setTr()` in `index.astro`). Nodes built during body parse are filled from an empty dictionary and stay in the build language forever otherwise. The `i18nApplied` event is the load-time repair signal — `langChanged` is toggle-only and has thirteen listeners, several of which re-fetch.
4. **Client renderers that replace server-rendered markup must clear their container** (`renderHero` in `team-page.js`) and keep their markup in step with the Astro component (`TeamHero.astro` / `TeamPhoto.astro`), or the swap becomes a visible jump.
5. **`window.__KSCW_DIRECTUS` and `window.__I18N_BAKED` are set by inline scripts in `BaseLayout.astro`'s `<head>` and must stay above every script that talks to Directus** (`error-logger.js` included); `admin.astro` has its own `<head>` and repeats the `__KSCW_DIRECTUS` selection — keep the two copies in step (2026-09-28, F-41 / F-46).

Tests: `tests/e2e/i18n-first-paint.spec.ts`, `data-parallel-load.spec.ts`, `team-page-build-time.spec.ts`, `i18n-runtime-strings.spec.ts`, `fonts-self-hosted.spec.ts`. Read the header of `data-parallel-load.spec.ts` before editing it — three timing-based shapes were tried and abandoned; it pins the dictionary request *open* rather than timing anything.

There is deliberately **no** `i18n-loading` veil. It existed as four `classList.remove()` calls with nothing adding the class and no CSS rule, and comments claiming it covered the flash. Hiding the gap trades wrong-language text for invisible text; the fix is to close the gap.

## Build Prerequisites
- Node `>=22.12`
- Copy `.env.example` → `.env` and set `DIRECTUS_URL` (build-time Astro frontmatter fetches; defaults to the dev Directus)
- **A production build fails when the basketball youth data cannot be fetched** (`strictBuildData()` in `src/lib/directus.ts`). On 13.08.2026 a transient `teams` 403 shipped ten nameless fallback cards to the live site and stayed up for an hour, because a degraded page is indistinguishable from a good deploy — failing keeps the last good deploy live instead. Only `astro build` against `directus.kscw.ch` is strict: `astro dev` and the dev/preview builds (which target the deliberately restricted `directus-dev`) still degrade. `DIRECTUS_STRICT=0` overrides it when a deploy has to go out with Directus down.

## Changelog & Versioning

- **CHANGELOG.md** at repo root — update with every meaningful change
- **Changelog on site** — displayed on `/club/feedback` (single page; separate DE and EN sections in the same file, toggled client-side by the i18n engine)
- **Version** in `package.json` — bump with each changelog entry (semver: patch for fixes, minor for features, major for breaking changes)
- **At end of every session**: Ask the user "Should this commit be added to the changelog and version bumped?" before finishing. If yes, update CHANGELOG.md, the feedback page changelog sections (both DE and EN), and bump `package.json` version.

## Related
- **Wiedisync** (main KSCW platform): `github.com/Lucanepa/wiedisync`
- **Directus API**: `directus.kscw.ch`
- **Infra notes** (tokens — gitignored): `docs/infra.md`. Content predates the current deploy setup (partially Coolify-era) — for anything shared with wiedisync, `wiedisync`'s `INFRA.md` is authoritative.
