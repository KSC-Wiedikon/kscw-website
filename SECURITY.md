# Security baseline — KSCW website (`kscw-website`)

Static Astro 6 site on Cloudflare Pages (`kscw.ch`). Client behaviour via `public/js/*.js` + `src/islands/*.ts`. Data is fetched at build time and client-side from the **shared Directus backend** (`directus.kscw.ch`, repo `wiedisync` — its own `SECURITY.md` governs the API). There is a real admin page at `src/pages/admin.astro` (CRUD against Directus via the `/kscw/wadmin/*` server-validated endpoints).

## Trust boundaries

- The site is a **public static asset** — anything shipped to `dist/` is world-readable. No secret/token is embedded in the bundle (verified). The admin page's client-side gate is cosmetic; every privileged read/write is re-authorized server-side by `/kscw/wadmin/*` + Directus permissions, with the Directus token obtained via a runtime login form and held in `sessionStorage`.
- Minor (under-18) PII protection lives **upstream** in the Directus `/kscw/public/team/:id` endpoint (underage teams return an empty roster; every other roster is `isMinor(birthdate)`-filtered fail-closed). The website renders only what that endpoint returns — it must never call a wider members API for public pages.
- CORS: this repo emits **no** `Access-Control-Allow-Origin` header (verified across `src/`, `public/`, `dist/`, `functions/`, git history). The static site is not cross-origin-readable by default.

## Hardening completed (audit log)

Deduplication shield — if a future audit re-finds one of these, it's a regression or a misunderstanding.

### 2026-06-25 — First dual-repo deep audit (security + permission + UI)

Audited alongside `wiedisync` (see `wiedisync/SECURITY.md` same date). Remediated:
- **Stored-HTML injection into the admin DOM (WEB-ADM-3).** `mixed_tournament_signups.notes` (filled by an unauthenticated public visitor) was injected with `innerHTML` after a **default-profile** DOMPurify pass, which permits `<a href>`/`<img src>` — a phishing-link / tracking-beacon vector in the admin's browser. Now rendered with the file's `escapeHtml()` (plain text).
- **`set:html` foot-gun (WEB-SEC-3).** `SectionHeader.astro` rendered its action label via `set:html`; changed to plain `{actionLabel}` interpolation (auto-escaped).
- **Fragile success-modal HTML (WEB-SEC-7).** `registration-form.js` / `mixed-tournament-form.js` / `volley-feedback-form.js` built the success message via `innerHTML` string concat; rebuilt with `createElement` + `textContent` so the message can never be interpreted as HTML.
- **DOMPurify vendored locally (WEB-SEC-4).** The news-body XSS sanitizer was loaded from `cdn.jsdelivr.net` (SRI-pinned + safe escape-only fallback). Vendored the SRI-verified DOMPurify 3.2.4 to `public/js/vendor/purify.min.js` and repointed `index.astro` + `news/index.astro`, so the sanitizer no longer depends on a third-party CDN's availability.
- **UI/a11y (UI-WEB-1..8).** Desktop nav dropdowns are now keyboard-operable (`:focus-within` + `aria-haspopup`/`aria-expanded` + Enter/Space/Escape handling); mobile accordion + hamburger keep `aria-expanded` honest; the language toggle uses `aria-pressed` (was a non-semantic `radiogroup`); lang/admin/search icon buttons get a ≥44 px coarse-pointer hit area; the English locale (`public/js/i18n/en.json`, 238 values) + standalone German "Optional" labels were corrected to Sentence case.

## Open / accepted / out-of-scope

| Item | Status | Why |
|---|---|---|
| `script-src 'unsafe-inline'` in the CSP (`public/_headers`) | Deferred | The site has many `is:inline` script blocks (theme pre-paint, i18n engine, lucide, Sentry init) and no per-build nonce/hash pipeline on a static CF Pages deploy. The actual stored-XSS sinks that would exploit it are now all closed (WEB-ADM-3 / WEB-SEC-3 / WEB-SEC-7) and DOMPurify is local, so this is the safe mitigation. Revisit via Astro's experimental CSP (auto-emits SHA-256 hashes) so `'unsafe-inline'` can be dropped. CDN entries already carry SRI. |
| `connect-src` allows `api.mymemory.translated.net` | Accepted | Admin-only auto-translate of news/event **titles** (published publicly anyway). No visitor data, no under-18 PII leaves the origin. Re-evaluate if draft/sensitive content is ever fed to it. |
| `admin.astro fetchMembers()` direct `/users?fields=email&limit=-1` | Accepted (manager-only) | Reachable only by manager-admins who bypass Directus permissions by design; **no** gated "Website Admin" role exists. A code comment flags that this call MUST be re-scoped if such a role is ever introduced (per the admin-section-access design spec). |
| Admin tokens in `sessionStorage` | Accepted | Standard for a static-CDN admin; every action is server-revalidated via `/kscw/wadmin/*`. Acceptable once `script-src` is locked down (deferred above). |

## Audit cadence

Re-run the deep audit (see `wiedisync` `/kscw-security-audit` skill, extended to this repo) on a milestone bump, a new admin capability, or a new outbound integration. Append a dated block above and move items between the two sections.
