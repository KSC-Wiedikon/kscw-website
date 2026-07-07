# KSCW Website

Public website for **KSC Wiedikon** — a volleyball and basketball club based in Zurich, Switzerland.

**Live:** [kscw.ch](https://kscw.ch)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Astro 6](https://astro.build) (static output) |
| Styling | Custom CSS design system (no Tailwind) |
| Backend | [Directus](https://directus.io) API (`directus.kscw.ch`) |
| Hosting | Cloudflare Pages |
| i18n | Single-URL routing — one page per path. German renders at build time via `t()`; English is swapped in client-side by `public/js/i18n.js` (dictionaries in `public/js/i18n/{de,en}.json`). Legacy `/de/…` `/en/…` URLs 301 to the canonical path. |

## Features

- **Bilingual** — Full German and English versions, one URL per page (language toggled client-side, not routed)
- **Dynamic team pages** — Live game data, rankings, rosters, and training schedules fetched from Directus
- **Calendar** — Event grid with tooltips and detail modals
- **Admin dashboard** — Hidden `/admin` page with Quill rich-text editor for managing news, events, sponsors, registrations, mixed-tournament signups, and scorer courses
- **Feedback form** — Bug reports, feature requests, and general feedback with Cloudflare Turnstile CAPTCHA and file upload
- **Dark mode** — System-aware theme toggle
- **Interactive islands** — Lightweight client-side interactivity without a JS framework

## Project Structure

```
src/
  pages/          # Astro routes (single-URL per page, plus /admin, feed.xml.ts, scorer-courses.json.ts)
  components/     # Reusable Astro components
  layouts/        # BaseLayout, PageLayout
  islands/        # Client-side interactivity (theme, nav, calendar, etc.)
  data/           # Static JSON/TS (teams, board, contacts)
  lib/            # Utilities (Directus client, i18n helper)
  lib/fetch/      # Build-time Directus fetchers (teams, games, rankings, events, sponsors, news)
  _parked/        # Parked pages kept in the tree but not routed (e.g. retired mixed-tournament pages)
  styles/         # Custom CSS design system (global.css)
public/
  js/             # Vanilla-JS runtime layer (i18n engine + dictionaries, forms, search, scoreboard, error-logger)
  docs/           # Static PDFs (Statuten, license/self-declaration forms, Schreiberwesen)
  images/         # Images and favicons
functions/        # Cloudflare Pages Functions (e.g. pages.dev → kscw.ch redirect middleware)
tests/
  unit/           # Vitest unit tests
  e2e/            # Playwright end-to-end tests (incl. security-xss, accessibility)
scripts/          # One-off maintenance scripts (e.g. PocketBase → Directus asset migration)
docs/             # Handover notes; infra.md is gitignored (contains tokens)
```

## Getting Started

Requires Node `>=22.12`.

```bash
npm install
cp .env.example .env   # set DIRECTUS_URL (defaults to the dev Directus)
npm run dev             # Dev server at localhost:4321
npm run build           # Production build → dist/
npm run preview         # Preview production build
npm test                # Unit tests (vitest)
npm run test:e2e        # E2E tests (Playwright, against `astro preview`)
```

## Deployment

Dev-first workflow: commits go to `dev` first (Cloudflare Pages preview deploy on every push), then `dev` is merged into `prod` with user approval, which triggers the live deploy at `https://kscw.ch`. See `CLAUDE.md` for the full branch, CI, and redirect details.

## Related

- [Wiedisync](https://github.com/Lucanepa/wiedisync) — Member-facing club platform (React + Directus)
