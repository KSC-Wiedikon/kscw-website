# Changelog

All notable changes to the KSC Wiedikon website. This file is the curated, user-facing release record (semver); the same notes appear on the site's feedback page (DE + EN). For commit-level detail see `git log`.

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
