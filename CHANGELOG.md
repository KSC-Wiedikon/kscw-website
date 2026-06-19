# Changelog

All notable changes to the KSC Wiedikon website are documented in this file.

## [4.0.0] — 2026-06-19

### Added
- **Contact button on the basketball youth page**: a "Kontakt aufnehmen" button at the top of `/basketball/teams/nachwuchs` links straight to the contact form (prefilled for basketball / Nachwuchs).

### Changed
- **Basketball youth coaches & training now live from Directus**: the Nachwuchs cards (U8–U18) previously showed hardcoded placeholder coaches, training times and halls. Coaches now come from the team `coach` relationship (→ members) and training day/time/hall from the hall schedule (`hall_slots`), matched per age group by slot label. Every group lists all of its weekly sessions, and weekday names follow the language toggle. The Directus coach data was populated from the ClubDesk export (dev first, then prod).

### Fixed
- **Youth cards unreadable in dark mode**: the cards forced a white background via an undefined `--card-bg` variable, so under the default dark theme the light text sat on white — illegible. Cards now use the theme-aware `--bg-light` surface, which has proper contrast in both themes.

## [3.14.0] — 2026-06-19

### Fixed
- **Basketball page empty after the season rollover**: the basketball listing matched teams by their Directus primary key, which is reassigned at every June rollover (new rows created, old ones archived). After the 2026/27 rollover nothing matched and the basketball page showed zero teams. Basketball now matches on the season-stable `team_id` (e.g. `bb_1348`), which survives both the rollover **and** team renames. (Volleyball already matched by short name; switching it to `team_id` too is a follow-up.)
- **Team-card training times were hardcoded and stale**: the day/time on each team card came from static values in `src/data/teams.ts` and had drifted out of sync with the real hall schedule (e.g. volleyball H1 showed `Di/Do`, actual is `Mi/Fr`). Cards (volleyball + basketball) now render a live weekly training summary derived from Directus hall slots.

### Changed
- **`/kscw/public/teams` enriched** (wiedisync `kscw-endpoints`): now returns the stable `team_id` and a per-team weekly training summary (collapsed from the `trainings` hall slots, Mon→Sun, with hall name/address) so the website gets team identity and trainings in a single call. Deployed to Directus dev + prod.

## [3.13.0] — 2026-06-18

### Added
- **`kscw.ch` cutover prep**: the site is moving from `kscw-website.pages.dev` to its real domain `kscw.ch`. Added a Cloudflare Pages Functions middleware (`functions/_middleware.js`) that 302-redirects the bare `kscw-website.pages.dev` host to `kscw.ch`, so links already shared pointing at the pages.dev address land on the live site. A temporary 302 (not 301) so it stays cleanly reversible; kept at least until 2026-07-08

### Changed
- **Canonical site URL** set to `https://kscw.ch` in `astro.config.mjs` (was the pages.dev address), matching the RSS feed which already used it

## [3.12.0] — 2026-06-15

### Changed
- **Single-URL routing**: dropped the `/de` and `/en` URL prefixes — each page now has one canonical (German-slug) URL with the language toggled client-side via `public/js/i18n.js`. All legacy bilingual URLs are 301-redirected to their canonical paths through `public/_redirects` (Cloudflare Pages), so existing links, bookmarks and search results keep working

### Fixed
- **Recent results — basketball games**: completed basketball games rendered with the volleyball icon and an empty team chip. Root cause was data-side — the season rollover archived the games' linked teams, so the public API couldn't resolve them (`kscw_team` → `null`). Fixed by re-pointing the orphaned games to their active teams (wiedisync migration `107`). Added a website fallback too: the sport icon is derived from the `game_id` `bb_`/`vb_` prefix when a team can't be read, and an unresolvable team renders no chip instead of an empty pill

## [3.11.2] — 2026-05-30

### Fixed
- **Admin tabs unreachable on mobile**: the section tabs (news, events, registrations, sponsors, scorer courses, mixed turnier, …) overflowed off-screen with no way to reach them on phones. The tab bar is now a horizontally-scrollable sticky navbar — swipe sideways to reach every section, and it stays pinned to the top while you scroll

## [3.11.1] — 2026-05-23

### Fixed
- **Scorer course start time**: the English course on 08.07.2026 now starts at **19:00** (was 19:30); end stays 21:30, so the "add to calendar" event is a 2.5h block
- **German scorer course**: time cleared back to blank — both date and time now show as to-be-announced (TBD) until confirmed

## [3.11.0] — 2026-05-21

### Added
- **Admin quick-access lock**: small padlock icon next to the language toggle (desktop and mobile) that links directly to `/admin` — replaces the hidden footer link as the primary entry point
- **Hero sport buttons refresh**: rebuilt the Volleyball and Basketball buttons on the homepage with inline sport icons (`fill="currentColor"` ball SVGs), cleaner gradients (volleyball: KSCW blue with low-contrast Mikasa-gold sweep; basketball: warm orange with a top radial highlight), inset top highlight, and a 14° icon rotate on hover. Pulsating glow on hover preserved
- `prefers-reduced-motion` honored: icon rotation + hover pulse both disabled when the user opts out

## [3.10.0] — 2026-05-20

### Added
- **Sparkles-Hero auf den Sport-Seiten**: über `/de/volleyball/`, `/en/volleyball/`, `/de/basketball/` und `/en/basketball/` zieht im Hero-Bereich jetzt ein dezenter Schwarm goldener (Volleyball, gelb-tönig) bzw. orangener (Basketball) Lichtpunkte langsam nach oben — pure Canvas, pausiert automatisch wenn die Sektion aus dem Viewport scrollt
- **Tracing-Beam auf "Über uns"**: ab 1280px Bildschirmbreite verläuft links neben dem Inhalt ein vertikaler blau-goldener Balken, der mit dem Scroll-Fortschritt mitwächst — ein pulsierender goldener Punkt sitzt oben am Anfang
- Beide Effekte respektieren `prefers-reduced-motion` (Sparkles rendern einen statischen Frame, der Tracing-Beam bleibt voll gefüllt) und kosten zusammen unter 2 KB JavaScript

## [3.9.0] — 2026-05-20

### Added
- **Cursor-Spotlight auf Karten**: News- und Event-Karten auf der Startseite zeigen jetzt einen sanften goldenen Lichtkegel, der dem Mauszeiger folgt — gibt der Übersicht spürbar Tiefe
- **3D-Tilt auf Team-Karten**: alle Team-Karten (Volleyball & Basketball) kippen beim Überfahren leicht in Richtung des Mauszeigers (max. 6° auf beiden Achsen). Subtil, aber lebendig. Auf Touch-Geräten unverändert
- Beide Effekte respektieren `prefers-reduced-motion` und sind als Opt-in-Klassen umgesetzt (`.card-glow-grid` / `.tilt-3d`)

## [3.8.0] — 2026-05-20

### Added
- **Hero-Animationen**: die Startseite hat jetzt ein animiertes Hero — sanft driftende Hintergrundverläufe in Vereinsblau und Gold, ein dezenter Goldglanz zieht durch den Schriftzug "KSC Wiedikon", und die Volleyball/Basketball-Buttons pulsieren beim Überfahren in ihrer jeweiligen Sportfarbe
- **Scroll-Fortschrittsbalken**: ganz oben am Bildschirmrand zeigt ein dünner blau-goldener Balken jetzt an, wie weit man auf der aktuellen Seite gescrollt hat
- **Sanftere Einblendungen**: neue `fade-in--blur`-Variante, die Inhalte beim Reinscrollen mit einem leichten Weichzeichner einblendet
- **Belebte Zahlen-Counter**: die hochzählenden Statistiken (z.B. auf "Über uns") bekommen während der Animation einen kurzen goldenen Glow — die Counter wirken dadurch deutlich lebendiger
- Sämtliche neuen Animationen respektieren `prefers-reduced-motion` und schalten sich für Nutzer:innen mit reduzierter Bewegung automatisch ab

## [3.7.0] — 2026-05-20

### Added
- **Admin – Bereichsberechtigungen pro Person**: Manager (Superuser/Administrator) sehen im Admin-Bereich einen neuen Tab "Admin". Dort lässt sich pro Website-Admin auswählen, welche Bereiche (News, Events, Anmeldungen, Sponsoren, Schreiberkurse, Mixed-Turnier) für diese Person sichtbar und bearbeitbar sind. Die Trennung wird nicht nur in der UI angezeigt — der Server lehnt Direktzugriffe auf nicht freigegebene Bereiche ab (echte Berechtigungsprüfung, kein reines UI-Verstecken)

### Fixed
- **Schreiberkurse "Zum Kalender hinzufügen"**: der Link funktioniert jetzt auch auf dem Handy. Statt einer `.ics`-Datei (die auf Mobilgeräten in Google Calendar einen "Termin nicht gefunden"-Fehler nach dem Login auslöste) öffnet sich jetzt direkt das Google-Kalender-Erstellungsformular mit Titel, Datum/Zeit und Ort vorausgefüllt
- **Admin – Geburtsdatum-Anzeige**: Geburtsdaten werden jetzt im Schweizer Format `tt.mm.jjjj` angezeigt (ohne Uhrzeit-Anhang), statt des rohen ISO-Strings mit Zeitzone
- **Admin – Export "Anmeldungen"**: der Export erzeugt jetzt tab-getrennte Dateien (`.tsv`) statt komma-getrennt. Adressen mit Kommas brechen den CSV-Import dadurch nicht mehr

## [3.6.0] — 2026-05-19

### Added
- **Schreiberkurs "Zum Kalender hinzufügen"**: jeder Kurs hat jetzt einen Button (mit Kalender-Icon), der einen `.ics`-Termin herunterlädt — mit Titel, Datum/Zeit (Europe/Zurich, sommer-/winterzeitsicher), 3 h Dauer und dem Veranstaltungsort. Der Anmeldebutton hat ebenfalls ein Icon erhalten
- **Veranstaltungsort auf der Kurskarte**: Präsenz-Kurse zeigen jetzt die Adresse (KSC Wiedikon, Goldbrunnenstrasse 80, 8055 Zürich) direkt auf der Karte an

## [3.5.0] — 2026-05-19

### Changed
- **Schreiberkurs-Anmeldung**: das Anmeldeformular wird nicht mehr als gequetschtes eingebettetes iframe in der Seite angezeigt. Stattdessen öffnet ein klarer Button ("Zur Anmeldung" / "Sign up for this course") das OpnForm-Formular im Vollbild in einem neuen Tab — deutlich besser auf dem Handy

### Fixed
- **Admin – Aktiv-Schalter**: das Label "Aktiv" klebte am Toggle, weil eine generischere CSS-Regel das beabsichtigte Flex-Layout überschrieb. Label und Schalter stehen jetzt korrekt links bzw. rechts mit Abstand dazwischen

## [3.4.1] — 2026-05-14

### Changed
- **Kontaktformular Team-Dropdown**: zeigt nur noch Mannschaften, die aktuell für neue Spielende offen sind (`open_for_players = true`). Geschlossene Teams stehen nicht mehr zur Auswahl. Mit Pre-Select via URL (`?sport=…&teamId=…`) bleibt das Dropdown frei änderbar

## [3.4.0] — 2026-05-13

### Changed
- **Team-CTA "Kontakt aufnehmen"**: Button on team pages now opens the central contact form (`/de/club/kontakt`) with sport + team pre-filled, instead of a `mailto:` link that exposed coach/TR email addresses. Delivery routes server-side through the Directus `/kscw/contact` endpoint, which resolves the recipients (team coaches + TR) via the M2M relations (`teams_coaches`, `teams_responsibles`) and sends mail through the existing SES setup — addresses never leave the server. Email subject is "Kontakt {Team}" (DE) or "Contact {Team}" (EN), keyed to the URL locale of the originating page

## [3.3.2] — 2026-05-13

### Fixed
- **Vorstand mobile**: org chart now renders as a fishbone — President → Vice → central spine with TKs branching left and Kassier/Aktuar branching right, Beisitz centered at the bottom. All cards share the same width and height (sized to the tallest card)
- **Recent results / upcoming games**: long team chips (e.g. "Herren 3 (Unicorns) H4") used to push the table off-screen on mobile; chips now wrap at word boundaries. On desktop, the chip moved to its own second row beneath each game so the matchup column has more room
- **Game-table mobile**: each row now stacks as date+time / home vs away / score, with each score centered under its respective team. Long team names wrap instead of being truncated
- **Scoreboard mobile**: metric label sits on its own line above the average + leading team, so the team chip column stops being squeezed character-by-character

## [3.3.1] — 2026-05-13

### Changed
- **Vorstand page**: redesigned as a hierarchical org chart (President → Vice → 5 Ressorts) with CSS-drawn connector lines. Each card shows role, name, and an initials avatar (photos can be dropped into `public/images/board/` and referenced from `board-members.json`). Collapses to a single column on mobile. Data updated to reflect the new 2026/27 board

## [3.3.0] — 2026-05-13

### Added
- **Event signups**: events have a new `signup_url` field. Calendar event detail shows an "Anmelden / Sign up" button when set, plus a live count of submissions. Admins manage `signup_url` directly in `/admin` and can open an "Anmeldungen" responses table per event with one-click CSV export
- **OpnForm self-hosted at `forms.kscw.ch`**: replaces ClubDesk-hosted event signup pages that will break after the kscw.ch migration. Custom fork `Lucanepa/OpnForm` bakes in KSCW brand `#4A55A2`, removes the "Made with OpnForm" badge, falls back to the KSCW crest as default logo. Weekly auto-rebase against upstream via GitHub Actions
- **Trial trainings on team pages**: teams open for new players now show their next Probetrainings (date · time · hall) right next to the "Get in touch" CTA, so prospective players see when to drop in without emailing first
- **Language preference memory**: clicking EN/DE in the header now persists the choice. `kscw.ch` defaults to `/de/`, but visitors who previously chose English are routed to `/en/`

### Changed
- `docs/infra.md` consolidated: Hetzner/Coolify topology, the Directus container "not Coolify-managed" gotcha, recreation procedure for env var changes, AWS SES SMTP config, OpnForm fork lifecycle

## [3.2.4] — 2026-05-06

### Security
- Upgraded dependencies to clear 4 advisories (2 high, 2 moderate): astro 6.0.8 → 6.2.2 (XSS in `define:vars`), and transitive fixes for vite (path traversal, dev-server WS arbitrary read), defu (prototype pollution), postcss (XSS in stringify)
- Bumped `@playwright/test` 1.58.2 → 1.59.1 and `vitest` 4.1.1 → 4.1.5

## [3.2.3] — 2026-04-18

### Changed
- **News modal**: Removed all external links from the public news view — ticket and action links are now reserved for Wiedisync (members platform). When a news article contains external links, a Wiedisync CTA appears
- **News body typography**: Default text alignment is now justified with hyphenation and pretty wrapping, matching the Datenschutz/Impressum/Über uns style. Quill per-paragraph overrides (`ql-align-center`, `ql-align-right`, `ql-align-justify`) are honored

### Fixed
- **News page**: Removed redundant `is_published` filter from anonymous Directus queries — the Public role now enforces published-only at item level and hides the field, so the client filter caused 403 errors and an empty news page (homepage widget, news list, and RSS feed)

## [3.2.1] — 2026-04-04

### Changed
- **Datenschutz & Impressum**: Added Hetzner hosting section (Gunzenhausen, Nürnberg datacenter) — both DE and EN
- Updated deployment references from Cloudflare Pages to Hetzner
- **Auto-delete notifications**: Directus Flow deletes notifications older than 3 days (daily at 04:00 UTC)

## [3.2.0] — 2026-04-02

### New
- **Searchable nationality dropdown** with 5 favorites (CH, DE, FR, AT, IT) + all world countries
- **Phone country code selector** with all countries (default +41 CH), favorites first
- **Basketball fee categories**: Aktiv Erwachsene (CHF 350), Junioren U18 (CHF 200), Passiv (CHF 50), Familie (CHF 600)
- **Basketball licence dropdown** (OTR 1, OTR 2, OTN) — replaces old Funktion checkboxes
- **Swiss Basketball PDF documents** with download links: Lizenzantrag (mandatory), Self Declaration + National Team Declaration (non-Swiss only)
- **PDF pre-fill** via self-hosted pdf-lib — form data auto-fills downloaded PDFs

### Changed
- Anrede field auto-derived from Geschlecht (männlich→Herr, weiblich→Frau) — dropdown removed
- Funktion → Lizenz: Volleyball gets "Schreiber" checkbox, Basketball gets OTR dropdown
- Gender options capitalised (Männlich/Weiblich, Male/Female)
- ID upload: only front side required, back side optional

### Security
- Self-hosted pdf-lib (was unpkg CDN without SRI)
- Client-side file type + size validation before upload (JPG/PNG/WebP/PDF, max 10 MB)
- Turnstile CAPTCHA token reset on failed submission

## [3.1.0] — 2026-04-01

### New
- **Unified registration form** (`/de/weiteres/anmeldung`, `/en/weiteres/anmeldung`) for Volleyball, Basketball, and Passive memberships — replaces external ClubDesk form + Google Forms
- **Admin registrations tab** (`/admin` → Anmeldungen) with status filters, detail/edit modal, approve/reject workflow
- **ClubDesk CSV export** — semicolon-separated, UTF-8 BOM, exact ClubDesk column headers for auto-mapping
- **Basketball PDF pre-fill** — generates pre-filled Lizenzantrag + optional FIBA Self Declaration and National Team Declaration (client-side via pdf-lib)
- **File uploads** for ID copies (front/back) with download + auto-delete from admin
- **Confirmation emails** on registration: sport-specific content (VB: welcome + fees + volleymanager link, BB: next steps, Passive: invoice info)
- **Admin notification email** on each new registration
- **Privacy notice** inline with consent checkbox + auto-deletion Flow (90-day cron deletes registrations + files)
- **Expiring badge** in admin list for registrations approaching deletion

### Changed
- Mitgliedschaft page CTAs now link to internal registration form (was external kscw.ch + Google Forms)

## [3.0.0] — 2026-03-30

### Breaking
- **PocketBase → Directus migration**: API backend switched from `api.kscw.ch` to `directus.kscw.ch` / `directus-dev.kscw.ch`, aligning with the wiedisync platform
- Removed monolithic `data.js` global data layer, `window.KSCW` global, and `kscw-data-ready` event
- Removed `public/js/data.js`, `src/lib/pocketbase.ts`, all `api.kscw.ch` references, and PocketBase SDK CDN script

### New
- `src/lib/directus.ts` — thin typed Directus REST fetch wrapper (no SDK dependency)
- 7 per-page fetch modules in `src/lib/fetch/` (teams, games, rankings, news, events, sponsors, team-detail)
- Runtime hostname detection for prod/dev Directus URL switching
- `news` collection in Directus (prod + dev) with public read access

### Changed
- Admin page rewritten with Directus REST auth + CRUD
- Calendar, team pages, feedback, contact form, sponsors all migrated to Directus REST
- All team pages use `directusId` instead of `pbId`
- CSP headers updated for Directus domains

### Migration
- 60 file assets migrated to Directus storage (team photos, news, sponsor logos)
- 6 news records migrated from PocketBase

## [1.2.0] — 2026-03-20

### Testing
- Comprehensive test suite: Vitest (unit) + Playwright (E2E)
- 22 unit tests + 148 E2E tests across mobile (375px) and desktop (1280px)
- GitHub Actions CI pipeline on push to `dev`/`prod`

### Bug Fixes
- Feedback form Turnstile validation — token now sent via `X-Turnstile-Token` header (PocketBase was stripping non-schema fields from multipart body)
- Fixed 2 missing EN translation keys (`teamCaptainF`, `posSetterF`)
- Fixed calendar grid horizontal overflow on desktop
- Fixed Leaflet map causing horizontal overflow on mobile
- Fixed theme toggle not working (script not imported in BaseLayout)
- Fixed sponsor carousel not handling async-loaded content

## [1.0.0] — 2026-03-19

### Site Foundation
- Astro 6 static site with custom CSS design system
- PocketBase API backend (api.kscw.ch)
- Cloudflare Pages hosting with Worker-based URL routing
- Directory-based i18n: `/de/…` and `/en/…` with DE/EN toggle

### Teams
- Single dynamic team page replacing 16 static pages
- Live data from PocketBase: games, rankings, roster, training schedules, photos
- Promotion/relegation color bands on volleyball ranking rows
- Accordion groups in sport dropdown navs (Damen/Herren/Nachwuchs)

### Games & Calendar
- Homepage game rows with animations
- Game modal with sets, referees, venue, officials
- Scoreboard with Absolute / Per Game toggle, aggregate metrics, unique team counting, tie ranking
- Live calendar grid with event tooltips and detail modals (events injected at build time, training filtered by valid_from/until)

### Content & Navigation
- Über uns with history + Leaflet map (trio logo marker, Google Maps link)
- Reglemente page with SVRZ embeds, Sponsors page, Impressum & Datenschutz
- Shared header from partials, scrollable dropdowns, consistent nav order

### Feedback System
- Feedback form: bug / feature / feedback type pills
- Cloudflare Turnstile CAPTCHA + drag & drop file upload (max 5 MB, PNG/JPG/WebP)
- PocketBase submission with hooks for email + GitHub issue creation

### Admin
- Hidden `/admin` page with PocketBase auth, glassmorphism login card, password visibility toggle, dark/light mode
- Quill rich-text editor + DOMPurify via CDN
- Roles: website_admin / admin / superuser

### Infrastructure
- Domain migration: lucanepa.com → kscw.ch
- CF Pages forced rewrites (200!) for clean team URLs
- Instagram embeds on homepage
