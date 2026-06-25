# Changelog

All notable changes to the KSC Wiedikon website. This file is the curated, user-facing release record (semver); the same notes appear on the site's feedback page (DE + EN). For commit-level detail see `git log`.

## [1.2.0] — 2026-06-25

### Hall closures in the calendar
- The calendar now shows "Halle geschlossen" days — school holidays, public holidays and hall closures (e.g. for tournaments), read from the `hall_closures` collection. The many per-hall rows are collapsed into one marker per day/reason listing the affected halls, with a detail modal. A toolbar toggle shows/hides them (default on).
- Calendar subscription fixed and extended: the subscribe/download links pointed at a dead path (`/api/ical`) and are corrected to the live feed (`/kscw/ical`); hall closures are now an opt-in subscribe source. Also fixes a latent bug where selecting every source omitted the `source` filter and silently dropped events from the subscription.

## [1.1.1] — 2026-06-24

### Calendar & event dates fixed
- All-day events (e.g. the Photoday) showed up one day too early in the calendar and on the homepage. Dates are now always read in Swiss time (Europe/Zurich), so they land on the correct day regardless of where the visitor is.
- News dates are likewise pinned to Swiss time for consistency.

## [1.1.0] — 2026-06-20

### Standings by season
- Team-page standings now have a season picker — current tables, last season's final standings (2024/25 added back) and the archive. Driven off the rankings data directly, so it stays correct after teams roll over to the new season in June (when standings aren't published yet).
- For a season Swiss Volley hasn't published yet, a short "Data to be shared later by Swiss Volley" note appears instead of an empty table.

## [1.0.0] — 2026-06-19

First official release of the KSC Wiedikon website — a fast, bilingual (DE / EN) Astro static site backed by the club's Directus API and hosted on Cloudflare Pages. The sections below describe what the site does at 1.0.

### Site & navigation
- Bilingual German / English site with a single canonical URL per page and a client-side language toggle that remembers your choice.
- Live on the club's own domain, kscw.ch.

### Teams
- Dynamic team pages (volleyball + basketball) with live data from Directus: games, rankings, roster, photos and a weekly training summary derived from the real hall schedule.
- Promotion / relegation colour bands on rankings, season-stable team matching that survives the yearly rollover, and a basketball youth section with live coaches and training times.

### Games, scoreboard & calendar
- Homepage game rows and a game detail modal with sets, referees and venue.
- A scoreboard with Absolute / Per-Game toggle, and a live calendar with event tooltips and detail modals.

### Registration & membership
- A unified online registration form for volleyball, basketball and passive memberships, with ID upload, PDF pre-fill of the licence forms and Turnstile spam protection.
- An admin registrations tab with approve / reject workflow, ClubDesk CSV export and automatic confirmation emails.

### News, events & courses
- Club news on the homepage and a dedicated news page with RSS, calendar events with sign-up links and live submission counts, and scorer courses with an "add to calendar" button.

### Contact & feedback
- A central contact form that reaches the right coaches without exposing their email addresses, and a feedback form (bug / feature / feedback) with screenshot upload that opens a GitHub issue automatically.

### Content pages
- About us with club history and a map, the board as an org chart, regulations with SVRZ embeds, sponsors, imprint and privacy policy.

### Design & polish
- Animated hero, scroll-progress bar, card spotlight, 3D-tilt team cards and section-aware sparkle effects — all respecting "reduce motion".
- Swiss dd.mm.yyyy dates and HH:MM times throughout, with a dark / light theme.

### Admin & infrastructure
- A hidden admin area with per-person area permissions enforced on the server, not just hidden in the UI.
- Built on Astro 6 with a Directus REST backend, Cloudflare Pages hosting and hardened CSP / security headers.
