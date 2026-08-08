import { fetchAllItems } from '../directus'

// Build-time data for the basketball youth page (/basketball/teams/nachwuchs).
// Coaches come from the `teams.coach` M2M (→ members); training day/time/hall
// come from `hall_slots` (→ halls), matched to each age group through the
// slot's own `teams` M2M (label parsing is only a fallback — see codesForSlot).
// All of it is public-readable, so no token needed.

export interface YouthSlot {
  day: number        // 0 = Monday … 6 = Sunday (Directus hall_slots convention)
  start: string      // "HH:MM"
  end: string        // "HH:MM"
  hall: string
  // Last day this booking runs ("YYYY-MM-DD"), omitted for indefinite ones.
  // Rendered as data-valid-until so public/js/youth-status.js can drop the line
  // once the date passes — the build can't, see its pruneExpiredSlots().
  validUntil?: string
}

export interface YouthTeamInfo {
  coaches: string[]
  slots: YouthSlot[]
  // Set when the team is full: the waiting-list link (teams.waitlist_url) and
  // an optional button label (teams.waitlist_label, defaults client-side to
  // "Warteliste"). Absent → team has space, no waiting-list button shown.
  waitlistUrl?: string
  waitlistLabel?: string
  // teams.open_for_players — true when the team is actively recruiting. Drives
  // the green "Open for players" badge + contact link (only when not full).
  openForPlayers?: boolean
  // Directus team id, used to prefill the exact team in the contact-form link.
  teamId?: string
}

/** Map of age-group code (HU18, DU16, MU8 …) → coaches + training slots. */
export type YouthBasketball = Record<string, YouthTeamInfo>

interface DirectusTeam {
  name: string
  coach: Array<{ members_id: { first_name: string; last_name: string } | null } | null> | null
}

export interface DirectusSlot {
  day_of_week: number
  start_time: string
  end_time: string
  label: string
  // Validity window of the booking. hall_slots keeps expired seasons around, so
  // these decide what still belongs on the page — see isCurrentOrUpcoming.
  valid_from?: string | null
  valid_until?: string | null
  indefinite?: boolean | null
  hall: { name: string } | null
  // hall_slots ↔ teams M2M. The authoritative age-group link.
  teams?: Array<{ teams_id: { name: string } | null } | null> | null
}

interface DirectusTeamWaitlist {
  name: string
  waitlist_url: string | null
  waitlist_label: string | null
}

interface DirectusTeamOpen {
  id: number | string
  name: string
  open_for_players: boolean | null
}

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5)

// Directus team names that differ from the page's card code. The girls' teams
// were renamed for 2026/27: "1xDU18" is the U18 girls team, "2xDU18" the second
// girls squad — which plays the DU16B league and belongs on the U16 Mädchen
// card. That is also how the club itself booked them before the rename: the old
// "BB - DU16" hall_slots rows are team-linked to 2xDU18.
// Without this map both names upper-case to keys no card carries, so those two
// teams lose their coach line, their open/waiting-list badge, and (via the old
// label parsing) dumped every slot onto the DU18 card.
// Mirrored in public/js/youth-status.js — tests/unit/youth-basketball.test.ts
// asserts the two copies stay in sync.
export const TEAM_CODE_ALIASES: Record<string, string> = {
  '1XDU18': 'DU18',
  '2XDU18': 'DU16',
}

/** Directus team name → the `code` a youth card on the page is keyed by. */
export function cardCode(teamName: string | null | undefined): string {
  const key = (teamName ?? '').trim().toUpperCase()
  return TEAM_CODE_ALIASES[key] ?? key
}

/**
 * True while a slot is still worth showing. hall_slots never deletes finished
 * seasons — the 2025/26 rows (valid_until 2026-06-27) sat in the collection
 * next to the 2026/27 plan and rendered as extra, wrong training lines.
 *
 * Upcoming slots (valid_from in the future) are deliberately kept: the new
 * season's plan should be readable in the weeks before it starts. `indefinite`
 * rows carry a placeholder valid_until a year out and never expire on date.
 *
 * @param today ISO date (YYYY-MM-DD)
 */
export function isCurrentOrUpcoming(
  slot: Pick<DirectusSlot, 'valid_until' | 'indefinite'>,
  today: string,
): boolean {
  if (slot.indefinite) return true
  const until = (slot.valid_until ?? '').slice(0, 10)
  return !until || until >= today
}

// Full-team waiting-list links, keyed by upper-cased team name (= card code).
// Kept a SEPARATE fetch from the open-status one below because waitlist_url /
// waitlist_label are NOT public-readable — under the build's anonymous role
// this request 403s. Isolating it means that failure only drops the "Team voll"
// buttons; coaches, training and the (public) open badge still render. A team
// counts as "full" purely by having a non-empty waitlist_url.
async function fetchWaitlist(): Promise<Record<string, { url: string; label: string }>> {
  try {
    const teams = await fetchAllItems<DirectusTeamWaitlist>('teams', {
      filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
      fields: ['name', 'waitlist_url', 'waitlist_label'],
    })
    const out: Record<string, { url: string; label: string }> = {}
    for (const t of teams) {
      const url = (t.waitlist_url ?? '').trim()
      if (url) out[cardCode(t.name)] = { url, label: (t.waitlist_label ?? '').trim() }
    }
    return out
  } catch (err) {
    console.warn('[youthBasketball] waitlist fetch failed — full-team links omitted:', err)
    return {}
  }
}

// Open-for-players status + team id, keyed by upper-cased team name (= card
// code). open_for_players is public-readable, so this drives the green "Open
// for players" badge reliably even though the waitlist fetch above may 403.
// The id is used to prefill the exact team in the contact-form link.
async function fetchOpenStatus(): Promise<Record<string, { id: string; open: boolean }>> {
  try {
    const teams = await fetchAllItems<DirectusTeamOpen>('teams', {
      filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
      fields: ['id', 'name', 'open_for_players'],
    })
    const out: Record<string, { id: string; open: boolean }> = {}
    for (const t of teams) {
      out[cardCode(t.name)] = { id: String(t.id), open: t.open_for_players === true }
    }
    return out
  } catch (err) {
    console.warn('[youthBasketball] open-status fetch failed — open badges omitted:', err)
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

/**
 * Which youth cards a slot belongs on. The `teams` M2M is authoritative — the
 * label is free text and gets it wrong in both directions: "BB - 2xDU18" parses
 * to DU18 (wrong card), and "BB - U14-U18+" parses to nothing at all even
 * though the booking is linked to HU16. The label is used only when a slot
 * carries no team link.
 */
export function codesForSlot(slot: DirectusSlot): string[] {
  const linked = (slot.teams ?? [])
    .map(t => t?.teams_id?.name)
    .filter((n): n is string => !!n)
    .map(cardCode)
  return linked.length ? [...new Set(linked)] : codesFromLabel(slot.label)
}

/** True when `a` stays valid at least as long as `b` (no end date = forever). */
const outlives = (a: YouthSlot, b: YouthSlot) =>
  !a.validUntil || (!!b.validUntil && a.validUntil >= b.validUntil)

/**
 * Collapse slots that render identically and sort them weekday-then-time. The
 * card shows weekday + time only, so one session booked across two halls (DU12
 * in Borrweg 1 and 2) is a single training line, not two.
 *
 * Duplicates keep the longest-lived row: an expiring booking sitting next to
 * its open-ended replacement must not make the line vanish on the older end
 * date.
 */
export function dedupeSlots(slots: YouthSlot[]): YouthSlot[] {
  const byKey = new Map<string, YouthSlot>()
  for (const s of slots) {
    const key = `${s.day}|${s.start}|${s.end}`
    const prev = byKey.get(key)
    if (!prev || outlives(s, prev)) byKey.set(key, s)
  }
  return [...byKey.values()].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
}

export async function getYouthBasketball(): Promise<YouthBasketball> {
  try {
    const [teams, slots, waitlist, openStatus] = await Promise.all([
      fetchAllItems<DirectusTeam>('teams', {
        filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
        fields: ['name', 'coach.members_id.first_name', 'coach.members_id.last_name'],
      }),
      fetchAllItems<DirectusSlot>('hall_slots', {
        filter: { sport: { _eq: 'basketball' }, slot_type: { _eq: 'training' } },
        sort: ['day_of_week', 'start_time'],
        fields: [
          'day_of_week', 'start_time', 'end_time', 'label', 'hall.name',
          'valid_from', 'valid_until', 'indefinite', 'teams.teams_id.name',
        ],
      }),
      fetchWaitlist(),
      fetchOpenStatus(),
    ])

    const data: YouthBasketball = {}
    const ensure = (code: string) => (data[code] ??= { coaches: [], slots: [] })

    for (const t of teams) {
      const coaches = (t.coach ?? [])
        .map(c => c?.members_id)
        .filter((m): m is { first_name: string; last_name: string } => !!m)
        .map(m => `${m.first_name} ${m.last_name}`.trim())
      if (coaches.length) ensure(cardCode(t.name)).coaches = coaches
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const s of slots) {
      if (!isCurrentOrUpcoming(s, today)) continue
      const validUntil = s.indefinite ? '' : (s.valid_until ?? '').slice(0, 10)
      for (const code of codesForSlot(s)) {
        ensure(code).slots.push({
          day: s.day_of_week,
          start: hhmm(s.start_time),
          end: hhmm(s.end_time),
          hall: s.hall?.name ?? '',
          ...(validUntil ? { validUntil } : {}),
        })
      }
    }

    for (const info of Object.values(data)) info.slots = dedupeSlots(info.slots)

    for (const [code, w] of Object.entries(waitlist)) {
      const info = ensure(code)
      info.waitlistUrl = w.url
      if (w.label) info.waitlistLabel = w.label
    }

    for (const [code, o] of Object.entries(openStatus)) {
      const info = ensure(code)
      info.teamId = o.id
      info.openForPlayers = o.open
    }

    return data
  } catch (err) {
    console.warn('[youthBasketball] live fetch failed — cards render without coach/training:', err)
    return {}
  }
}
