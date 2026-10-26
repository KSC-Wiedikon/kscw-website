# Event Signups — Session Handover

Context for a fresh session resuming work on the KSCW event-signup system.

## Why this exists

`kscw.ch` is migrating off ClubDesk-hosted website. ClubDesk's event signup pages (e.g. the old `kscw.ch/weiteres/Turnier_2026`) die with the migration. ClubDesk has no public API or embed widget — research confirmed. We replaced it with a self-hosted **OpnForm** instance for the form-building/submission UX, and proxied its API through Directus for two display surfaces on kscw.ch.

## Architecture

```
┌─ Admin builds form ──────────► forms.kscw.ch (OpnForm)
│
├─ Admin copies share URL ─────► kscw.ch/admin → paste into event's signup_url
│                                (or directly in Directus event)
│
├─ Public sees "Anmelden" ─────► calendar event modal → opens forms.kscw.ch/forms/<slug> in new tab
│
├─ Public sees live count ─────► calendar modal calls directus.kscw.ch/kscw/opnform/forms/<slug>/count
│                                (proxy that uses OPNFORM_PAT, cached 60s, public)
│
└─ Admin sees responses ───────► /admin → "Anmeldungen" button → directus/kscw/opnform/forms/<slug>/submissions
                                  (admin-gated proxy, renders table + CSV export)
```

## Stack inventory

| Layer | Where | Notes |
|---|---|---|
| **Form builder** | OpnForm at `https://forms.kscw.ch` | Self-hosted as a plain Docker Compose project on the Infomaniak VPS (Switzerland) since 26.10.2026 — `/opt/opnform`, compose file in wiedisync `ops/opnform/`; Coolify was dropped with the move. Reached only through the kscw-club Cloudflare tunnel (`forms.kscw.ch` → `127.0.0.1:8095`). 7 containers (`opnform-nginx`, `opnform-ui`, `opnform-api`, `opnform-api-worker`, `opnform-api-scheduler`, `opnform-postgres`, `opnform-redis`) |
| **OpnForm UI image** | `ghcr.io/lucanepa/opnform-client:kscw-latest` | Custom fork at `github.com/Lucanepa/OpnForm` branch `kscw-customizations`. Weekly auto-rebase against upstream `OpnForm/OpnForm` |
| **SMTP** | AWS SES eu-central-1 (Frankfurt) | Reuses Directus' creds. `forms@noreply.kscw.ch` |
| **Schema** | Directus `events.signup_url` (string, nullable, max 500) | Added prod + dev 2026-05-12 |
| **Backend proxy** | `kscw-endpoints` extension, new file `src/opnform.js` | Wiedisync repo, deployed to `/opt/directus-kscw/extensions/kscw-endpoints/src/` |
| **Frontend** | `src/islands/calendar-grid.ts`, `src/pages/admin.astro` | This repo |

## Fork customizations (`Lucanepa/OpnForm` @ `kscw-customizations`)

Four surgical changes from upstream — kept minimal to ease rebases:

1. `client/css/app.css` — `--bg-form-color` / `--form-color` default `#4A55A2` (KSCW blue)
2. `client/components/pages/forms/show/PoweredBy.vue` — empty template (no "Made with OpnForm" badge)
3. `client/components/open/forms/OpenForm.vue` + `OpenFormFocused.vue` — logo falls back to `/kscw-logo.svg` when form has none; `showBrandingMedia` is always true in public mode
4. `client/public/kscw-logo.svg` — added (copy of `kscw-website/public/images/kscw_logo.svg`)

Plus `.github/workflows/kscw-build.yml` (auto-build to GHCR + weekly upstream rebase) and `KSCW-FORK.md` (docs).

**Conflict resolution**: if the weekly rebase fails, the workflow logs a `::error::` and exits. Playbook lives in `KSCW-FORK.md` in the OpnForm fork. Manual: clone, `git rebase upstream/main`, resolve conflicts in those 4 files, push.

## Vault entries (Vaultwarden via `rbw`)

| Entry | Use |
|---|---|
| `kscw-prod-admin-token` | Directus prod admin (for API mutations from this session) |
| `kscw-dev-admin-token` | Directus dev admin |
| `kscw-opnform-claude-token` | OpnForm "Claude / Directus" — full-access PAT |
| `kscw-opnform-readonly-token` | OpnForm "kscw-website-readonly" — used by Directus proxy as `OPNFORM_PAT` |
| `kscw-prod-env`, `kscw-dev-env` | Full Directus `.env` backups |

## Directus extension endpoints

Both live in `kscw-endpoints/src/opnform.js`, registered in `src/index.js`.

```
GET /kscw/opnform/forms/:slug/count
    Public, no auth. 60-sec in-memory cache.
    Returns: { count: N, cached: boolean }
    400 on bad slug, 404 if upstream not found, 502 on upstream error.

GET /kscw/opnform/forms/:slug/submissions?per_page=100&page=1
    Admin-only (checks req.accountability.admin).
    Returns: { title, fields: [{id,name,type}], data, total, page, per_page, last_page }
    `data` items have submission answers keyed by OpnForm property ID (UUID-ish).
    `fields[].type === 'nf-text'` items are presentational, filter them out in UI.
```

Env vars on Directus container:
- `OPNFORM_PAT` (required) — readonly PAT from vault
- `OPNFORM_BASE_URL` (optional, defaults to `https://forms.kscw.ch`)

## Directus container quirk

`directus-kscw` and `directus-kscw-dev` are plain Docker on the Infomaniak VPS (never Coolify-managed; Coolify is gone since the move on 26.10.2026) — raw `docker run` with `--env-file`. Adding env vars requires container *recreation* (not just restart). Full recreation command in `docs/infra.md` under "Directus container management (Hetzner)".

## Brand color/CSS

| Token | Value | Where |
|---|---|---|
| Primary blue | `#4A55A2` | `src/styles/global.css` as `--kscw-blue`; OpnForm fork `app.css` |
| Gold accent | `#FFC832` | `--kscw-gold` |
| Logo | `public/images/kscw_logo.svg` | also copied into fork as `client/public/kscw-logo.svg` |

## Outstanding TODOs (likely next-session work)

1. **End-to-end test against real data** — at handover time, the test form `https://forms.kscw.ch/forms/contact-form-i6dtvv` had 0 submissions. Once 1+ real submissions exist:
   - Verify count line in calendar event modal renders correctly
   - Verify admin "Anmeldungen" modal table renders all field columns
   - Verify CSV export downloads with correct headers + values
2. **CSV column mapping for ClubDesk import** — current CSV uses OpnForm field labels as headers. If the user wants the exact ClubDesk column order (per `reference_clubdesk_csv_import` memory), wire a per-event mapping or document the manual reorder step.
3. **i18n the admin responses modal** — strings hardcoded to German (`Anmeldungen`, `Lade…`, `CSV exportieren`, etc.). Add English variants if `/admin` supports locale switching.
4. **Optional: `max_signups` field on events** — would let us show "23 / 40 — 17 Plätze frei" instead of just the count. Small Directus schema addition + tweak to count rendering.
5. **Optional: Formbricks/OpnForm-style submission webhook to Directus** — currently submissions only live in OpnForm. A webhook → Directus `event_signups` collection would give a single queryable source. Deferred from v1 as not yet needed.
6. **Changelog + version bump + commit** — the work in this session has not been committed yet. Commit message draft:
   > "feat(events): self-hosted OpnForm signup pipeline — fork with KSCW branding, Directus proxy endpoints, calendar count + admin responses table + CSV export"

## Files modified in this repo (uncommitted at handover)

```
M src/styles/global.css                              # .cal-modal-signup-count + .cal-modal-signup
M src/islands/calendar-grid.ts                       # signupUrl + count fetch + Anmelden button
M src/lib/fetch/events.ts                            # signupUrl field added to interface + mapper
M src/pages/admin.astro                              # signup_url input + "Anmeldungen" button + responses modal + CSV
M src/pages/de/weiteres/kalender.astro               # pass signupUrl through
M src/pages/en/weiteres/kalender.astro               # pass signupUrl through
M src/i18n/de.json + en.json                         # eventSignUp key
M docs/infra.md                                      # full OpnForm section, container recreation procedure
+ docs/handover-event-signups.md                     # this file
```

Plus in the wiedisync repo (need separate commit):

```
M directus/extensions/kscw-endpoints/src/index.js    # register opnform routes
+ directus/extensions/kscw-endpoints/src/opnform.js  # new proxy module
```

The on-server copy at `/opt/directus-kscw/extensions/kscw-endpoints/` was already updated via `scp` and Directus container was already recreated to pick up `OPNFORM_PAT`. So prod is ahead of the git repo — first commit + push in wiedisync should match what's already running.

## How to verify everything from scratch in a new session

```bash
# 1. Check OpnForm reachable and healthy
curl -sI https://forms.kscw.ch | head -1
ssh hetzner 'sudo docker ps --format "{{.Names}} | {{.Status}}" | grep opnform'   # alias `hetzner` points at the Infomaniak VPS since 26.10.2026

# 2. Check Directus proxy
curl -s "https://directus.kscw.ch/kscw/opnform/forms/contact-form-i6dtvv/count"
# expected: {"count":N,"cached":bool}

# 3. Check OpnForm API directly (readonly token)
TOKEN=$(rbw get kscw-opnform-readonly-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://forms.kscw.ch/api/open/forms/contact-form-i6dtvv/submissions?per_page=1" \
  | jq '.meta.total'

# 4. Check the fork builds
gh run list --repo Lucanepa/OpnForm --branch kscw-customizations --limit 1

# 5. Local frontend test
cd ~/Desktop/Github/kscw-website && npm run dev
# → http://localhost:4321/de/weiteres/kalender → click an event with signup_url → Anmelden + count
```

## Reference research from this session

- ClubDesk has no public API or embed widget — confirmed via official forum threads
- OpnForm uses Laravel Sanctum PATs, form-resolved-by-slug, list submissions at `GET /api/open/forms/:slug/submissions?per_page=N`, hard cap 100 per page
- Comparison agent results saved in conversation: Formbricks (multi-lang paid → switched away), OpnForm (chosen), LimeSurvey (overkill), Tally (SaaS, decent alt if self-hosting becomes burden)
