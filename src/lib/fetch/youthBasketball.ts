import { fetchAllItems } from '../directus'

// Build-time data for the basketball youth page (/basketball/teams/nachwuchs).
// Coaches come from the `teams.coach` M2M (→ members); training day/time/hall
// come from `hall_slots` (→ halls), matched to each age group by parsing the
// slot label (e.g. "BB - HU18"). Both are public-readable, so no token needed.

export interface YouthSlot {
  day: number        // 0 = Monday … 6 = Sunday (Directus hall_slots convention)
  start: string      // "HH:MM"
  end: string        // "HH:MM"
  hall: string
}

export interface YouthTeamInfo {
  coaches: string[]
  slots: YouthSlot[]
  // Set when the team is full: the waiting-list link (teams.waitlist_url) and
  // an optional button label (teams.waitlist_label, defaults client-side to
  // "Warteliste"). Absent → team has space, no waiting-list button shown.
  waitlistUrl?: string
  waitlistLabel?: string
}

/** Map of age-group code (HU18, DU16, MU8 …) → coaches + training slots. */
export type YouthBasketball = Record<string, YouthTeamInfo>

interface DirectusTeam {
  name: string
  coach: Array<{ members_id: { first_name: string; last_name: string } | null } | null> | null
}

interface DirectusSlot {
  day_of_week: number
  start_time: string
  end_time: string
  label: string
  hall: { name: string } | null
}

interface DirectusTeamWaitlist {
  name: string
  waitlist_url: string | null
  waitlist_label: string | null
}

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5)

// Full-team waiting-list links, keyed by upper-cased team name (= card code).
// Fetched separately and independently caught so a missing field / revoked
// permission only drops the waiting-list buttons — coaches and training still
// render. A team counts as "full" purely by having a non-empty waitlist_url.
async function fetchWaitlist(): Promise<Record<string, { url: string; label: string }>> {
  try {
    const teams = await fetchAllItems<DirectusTeamWaitlist>('teams', {
      filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
      fields: ['name', 'waitlist_url', 'waitlist_label'],
    })
    const out: Record<string, { url: string; label: string }> = {}
    for (const t of teams) {
      const url = (t.waitlist_url ?? '').trim()
      if (url) out[t.name.toUpperCase()] = { url, label: (t.waitlist_label ?? '').trim() }
    }
    return out
  } catch (err) {
    console.warn('[youthBasketball] waitlist fetch failed — full-team links omitted:', err)
    return {}
  }
}

// One label can serve several groups, e.g. "BB - MU8/MU10" (combined session)
// or "BB - HU16+" (extra session). Pull every [HDM]U<number> token; adult
// labels like "BB - H3" / "BB - D Lions" yield none and are ignored.
function codesFromLabel(label: string): string[] {
  const out = new Set<string>()
  for (const m of (label || '').toUpperCase().matchAll(/[HDM]U\s*0*(\d+)/g)) {
    out.add(`${m[0][0]}U${m[1]}`)
  }
  return [...out]
}

export async function getYouthBasketball(): Promise<YouthBasketball> {
  try {
    const [teams, slots, waitlist] = await Promise.all([
      fetchAllItems<DirectusTeam>('teams', {
        filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
        fields: ['name', 'coach.members_id.first_name', 'coach.members_id.last_name'],
      }),
      fetchAllItems<DirectusSlot>('hall_slots', {
        filter: { sport: { _eq: 'basketball' }, slot_type: { _eq: 'training' } },
        sort: ['day_of_week', 'start_time'],
        fields: ['day_of_week', 'start_time', 'end_time', 'label', 'hall.name'],
      }),
      fetchWaitlist(),
    ])

    const data: YouthBasketball = {}
    const ensure = (code: string) => (data[code] ??= { coaches: [], slots: [] })

    for (const t of teams) {
      const coaches = (t.coach ?? [])
        .map(c => c?.members_id)
        .filter((m): m is { first_name: string; last_name: string } => !!m)
        .map(m => `${m.first_name} ${m.last_name}`.trim())
      if (coaches.length) ensure(t.name.toUpperCase()).coaches = coaches
    }

    for (const s of slots) {
      for (const code of codesFromLabel(s.label)) {
        ensure(code).slots.push({
          day: s.day_of_week,
          start: hhmm(s.start_time),
          end: hhmm(s.end_time),
          hall: s.hall?.name ?? '',
        })
      }
    }

    for (const [code, w] of Object.entries(waitlist)) {
      const info = ensure(code)
      info.waitlistUrl = w.url
      if (w.label) info.waitlistLabel = w.label
    }

    return data
  } catch (err) {
    console.warn('[youthBasketball] live fetch failed — cards render without coach/training:', err)
    return {}
  }
}
