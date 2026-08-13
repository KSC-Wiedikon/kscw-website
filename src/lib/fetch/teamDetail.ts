import { DIRECTUS_URL } from '../directus'

/**
 * Build-time hero data for a team detail page.
 *
 * These pages used to ship as empty containers plus five "wird geladen"
 * placeholders — the whole page was drawn by public/js/team-page.js after a
 * Directus round trip. That contradicted the hybrid instant-paint contract the rest
 * of the site keeps (CLAUDE.md; /volleyball/index.astro does it properly), and it
 * cost a measured **CLS of 0.633** on /volleyball/hu20 — "poor" by Core Web Vitals
 * and by far the worst number on the site — because the hero appeared under the
 * reader once the data landed. It also meant no team page worked at all with JS off
 * or Directus down.
 *
 * `/kscw/public/team/<id>` is anonymously readable (verified), so the build can have
 * the same payload the browser gets. Only the hero fields are taken here — see the
 * note in the page templates for why the roster is deliberately NOT pre-rendered.
 */
/** One weekly training slot, deduped from the dated sessions the API returns. */
export interface TrainingSlot {
  /** 0 = Monday, matching the `weekdayLong0…6` dictionary keys and hall_slots. */
  weekday: number
  /** 'HH:MM', 24-hour (CLAUDE.md → Time & date). */
  start: string
  end: string
  hall: string
  address: string
}

export interface TeamDetail {
  name: string
  fullName: string
  league: string
  season: string
  /** Directus asset id of the team photo, or '' when there is none. */
  picture: string
  /**
   * The weekly training pattern.
   *
   * `/kscw/public/team/<id>` has always returned a 10-item `upcoming_trainings`
   * array with day, time and hall — this function simply threw it away, so the most
   * asked-for fact on the site ("when and where does this team train?") reached the
   * page only after JS and a Directus round trip. A crawler, a no-JS visitor and a
   * first paint all saw "Trainingszeiten werden geladen…" instead.
   *
   * Deduped to the recurring pattern rather than listed as dates: ten dated rows are
   * the same two or three weekly slots repeated, and the weekly shape is what a
   * prospective member actually wants to read.
   */
  trainings: TrainingSlot[]
}

/** 'HH:MM:SS' → 'HH:MM'. Times arrive from Postgres with seconds. */
function hhmm(raw: unknown): string {
  return String(raw ?? '').slice(0, 5)
}

function weeklyPattern(rows: unknown): TrainingSlot[] {
  if (!Array.isArray(rows)) return []
  const seen = new Map<string, TrainingSlot>()

  for (const row of rows) {
    // A cancelled one-off says nothing about the weekly pattern.
    if (!row || row.cancelled || !row.date || !row.start_time) continue
    const when = new Date(row.date)
    if (Number.isNaN(when.getTime())) continue

    // Dates arrive as midnight UTC, so the UTC weekday is the intended one — and
    // getUTCDay() counts from Sunday while this codebase counts from Monday.
    const weekday = (when.getUTCDay() + 6) % 7
    const slot: TrainingSlot = {
      weekday,
      start: hhmm(row.start_time),
      end: hhmm(row.end_time),
      hall: String(row.hall_name || ''),
      address: String(row.hall_address || ''),
    }
    const key = `${slot.weekday}|${slot.start}|${slot.end}|${slot.hall}`
    if (!seen.has(key)) seen.set(key, slot)
  }

  return [...seen.values()].sort((a, b) =>
    a.weekday - b.weekday || a.start.localeCompare(b.start),
  )
}

/**
 * @param directusId the team's numeric Directus id
 * @returns the hero fields, or null when Directus is unreachable — in which case the
 *          page falls back to exactly what it rendered before: empty containers for
 *          team-page.js to fill. Failing soft matters here because this fetch now
 *          runs for a dozen pages on every build.
 */
export async function getTeamDetail(directusId: string): Promise<TeamDetail | null> {
  if (!directusId) return null
  try {
    const res = await fetch(`${DIRECTUS_URL}/kscw/public/team/${encodeURIComponent(directusId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = (await res.json())?.data
    if (!raw?.name) return null
    return {
      name: String(raw.name),
      fullName: String(raw.full_name || raw.name),
      league: String(raw.league || ''),
      season: String(raw.season || ''),
      picture: raw.team_picture ? String(raw.team_picture) : '',
      trainings: weeklyPattern(raw.upcoming_trainings),
    }
  } catch (err) {
    console.warn(`[teamDetail] ${directusId} unavailable — page ships without a hero:`, err)
    return null
  }
}

/** The same asset URL public/js/team-page.js builds, so the two never disagree. */
export function teamPhotoUrl(picture: string): string {
  return `${DIRECTUS_URL}/assets/${picture}?width=1280&quality=80`
}
