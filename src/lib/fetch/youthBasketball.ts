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
  // teams.name as Directus currently spells it ("DU18 Spark"). Rendered as the
  // card heading when it says more than the bare age-group code — see
  // components/YouthTitle.astro. Also the key youth-status.js matches a card
  // by, which is what keeps two teams sharing one age group apart.
  name?: string
  // Set when the team is full: the waiting-list link (teams.waitlist_url) and
  // an optional button label (teams.waitlist_label, defaults client-side to
  // "Warteliste"). Absent → team has space, no waiting-list button shown.
  waitlistUrl?: string
  waitlistLabel?: string
  // teams.open_for_players — true when the team is actively recruiting. Drives
  // the green "Open for players" badge + contact link (only when not full).
  openForPlayers?: boolean
  // teams.open_for_girls / open_for_boys — mixed (MU) teams recruit the two
  // separately, so each flag gets its own badge. Only read for MU cards, and
  // only while openForPlayers is on: they are sub-toggles of it in wiedisync.
  openForGirls?: boolean
  openForBoys?: boolean
  // Directus team id, used to prefill the exact team in the contact-form link.
  teamId?: string
}

/**
 * Age-group code (HU18, DU18, MU8 …) → the Directus teams playing it, in name
 * order. A list rather than one entry per code because an age group can hold
 * more than one squad: 2026/27 has two U18 girls' teams (DU18 Spark and DU18
 * Fire) and no U16 girls' team at all. The page renders one card per entry, so
 * the section follows whatever Directus actually holds.
 */
export type YouthBasketball = Record<string, YouthTeamInfo[]>

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
  open_for_girls: boolean | null
  open_for_boys: boolean | null
}

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5)

// A [DHM]U<age> token anywhere in a free-text string: "DU18 Spark" → D/18,
// "BB - MU8/MU10" → M/8 + M/10. Leading zeros and a space before the number
// ("HU 18B") are both in live use.
const CODE_TOKEN = /([HDM])U\s*0*(\d+)/gi

// Club-wide waiting list, used when a youth team is closed but carries no link
// of its own. Coaches can only toggle open_for_players (wiedisync's roster
// editor); teams.waitlist_url is not editable there, so without this fallback
// switching a team to "closed" left its card with no badge and no way in.
// A team's own waitlist_url still wins — DU12 has a separate form.
// Mirrored in public/js/youth-status.js, kept honest by the sync test.
export const DEFAULT_WAITLIST_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfvak-SELFox7Bv2RVLrjA_uZ2K6vTiKYgRheDtck92VH8crQ/viewform'

/**
 * Which age group a Directus team belongs to — derived from its name, never a
 * lookup table. "DU18 Spark" and "DU18 Fire" both → DU18; "MU8" → MU8.
 *
 * The name is the club's own statement of what a team is, and it is the only
 * field that says so: the LEAGUE a squad plays routinely disagrees. Both U18
 * girls' teams are U18 teams, but Fire plays the DU16B league (second squads
 * play down); HU12 plays the mixed MixU12M league and is still the boys' team.
 * Grouping by league would scatter them across the wrong sections.
 *
 * Deriving also survives renames — the club has renamed these teams three times
 * now (DU16/DU18 → 1xDU18/2xDU18 → DU18 Fire/Spark), and the hardcoded alias
 * map this replaces silently emptied both cards on every one of them.
 *
 * Returns '' for adult teams (no [DHM]U token at all) so they match no card.
 */
export function cardCode(teamName: string | null | undefined): string {
  CODE_TOKEN.lastIndex = 0
  const m = CODE_TOKEN.exec(teamName ?? '')
  return m ? `${m[1].toUpperCase()}U${Number(m[2])}` : ''
}

/**
 * The heading a youth card should carry, or null to keep the page's own label.
 *
 * A Directus name that is just the bare age-group code ("MU8") reads worse than
 * the German label the card already has ("U8 Mixed"), so it is ignored; a name
 * that carries more than the code ("DU18 Spark") is what the club actually
 * calls the team and wins. Mirrored in public/js/youth-status.js.
 */
export function cardTitle(liveName: string | null | undefined, code: string): string | null {
  const name = (liveName ?? '').trim()
  if (!name) return null
  return name.replace(/\s+/g, '').toUpperCase() === code.toUpperCase() ? null : name
}

/** "DU18" → { gender: 'D', age: 18 }; anything else → null. */
function parseCode(code: string | null | undefined): { gender: string; age: number } | null {
  const m = /^([HDM])U0*(\d+)$/.exec((code ?? '').toUpperCase())
  return m ? { gender: m[1], age: Number(m[2]) } : null
}

/**
 * The lowest age group a card's Jahrgänge cover — its own group, unless the club
 * runs no team one step down that those players could actually join.
 *
 * 2026/27 has no U16 girls' squad, so the two U18 girls' teams take the U16
 * players as well and their card reads 2009–2012 rather than 2009 + 2010. That is
 * what the club tells parents, and it is not a fact about U18: it is a fact about
 * this season's roster, which is why it is derived from Directus instead of
 * written down. A DU16 team appearing next season narrows the card by itself.
 *
 * "Could join" is per gender, and Mixed counts for both ways round: HU12 stops at
 * its own two years because MU10 exists even though the club runs no HU10, and a
 * Mixed group is only covered when both halves have somewhere to go.
 *
 * The ladder walked is the set of ages Directus actually holds, not a fixed
 * two-year step, so a season running U17 instead of U16 still lines up. It also
 * means an age group the club runs for NO gender drops out of the ladder entirely
 * and widens nothing: that says nothing about who took those players on, and the
 * case this exists for is the one the club is actually in — the group exists (HU16
 * does) but not for these players (no DU16). Same reason no live data at all
 * (Directus unreachable → the fallback card) leaves every card at its own two
 * Jahrgänge: understating the range beats claiming a year nobody is eligible for.
 *
 * @param presentCodes every age-group code Directus has an active team for
 * @returns the lowest covered U-number, or null when `code` is not a group code
 */
export function groupSpanTo(code: string, presentCodes: string[]): number | null {
  const self = parseCode(code)
  if (!self) return null

  const present = presentCodes
    .map(parseCode)
    .filter((p): p is { gender: string; age: number } => !!p)

  const gendersAt = (age: number) => new Set(present.filter(p => p.age === age).map(p => p.gender))
  const covered = (age: number) => {
    const g = gendersAt(age)
    if (g.has('M')) return true                              // Mixed takes everyone
    if (self.gender === 'M') return g.has('D') && g.has('H')  // both halves have a home
    return g.has(self.gender)
  }

  let lowest = self.age
  for (const age of [...new Set(present.map(p => p.age))].sort((a, b) => b - a)) {
    if (age >= self.age) continue
    if (covered(age)) break
    lowest = age
  }
  return lowest
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

// Full-team waiting-list links, keyed by the Directus team name.
// Kept a SEPARATE fetch from the open-status one below: waitlist_url /
// waitlist_label used to be non-public and this request 403'd. They ARE
// public-readable as of 2026-08-08 (verified anonymously), but keeping the
// fetches split still means a future permission change only drops the
// "Team voll" buttons — coaches, training and the open badge keep rendering.
// A team counts as "full" when it has a waitlist_url, or when it is explicitly
// closed (see DEFAULT_WAITLIST_URL).
async function fetchWaitlist(): Promise<Record<string, { url: string; label: string }>> {
  try {
    const teams = await fetchAllItems<DirectusTeamWaitlist>('teams', {
      filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
      fields: ['name', 'waitlist_url', 'waitlist_label'],
    })
    const out: Record<string, { url: string; label: string }> = {}
    for (const t of teams) {
      const url = (t.waitlist_url ?? '').trim()
      if (url && t.name) out[t.name] = { url, label: (t.waitlist_label ?? '').trim() }
    }
    return out
  } catch (err) {
    console.warn('[youthBasketball] waitlist fetch failed — full-team links omitted:', err)
    return {}
  }
}

// Open-for-players status + team id, keyed by the Directus team name.
// open_for_players is public-readable, so this drives the green "Open for
// players" badge reliably even though the waitlist fetch above may 403.
// The id is used to prefill the exact team in the contact-form link.
interface OpenStatus { id: string; open: boolean; girls: boolean; boys: boolean }

const OPEN_FIELDS = ['id', 'name', 'open_for_players']
const GENDER_FIELDS = ['open_for_girls', 'open_for_boys']

// Asking for a field the anonymous role can't see 403s the WHOLE request, so a
// Directus that has not run migration 298 yet would answer the combined query
// with an error and take every open badge down with it. Try the full field set,
// fall back to the pre-298 one.
async function fetchOpenTeams(): Promise<DirectusTeamOpen[]> {
  const query = (fields: string[]) => fetchAllItems<DirectusTeamOpen>('teams', {
    filter: { sport: { _eq: 'basketball' }, active: { _eq: true } },
    fields,
  })
  try {
    return await query([...OPEN_FIELDS, ...GENDER_FIELDS])
  } catch {
    console.warn('[youthBasketball] open_for_girls/boys unavailable — girls/boys badges omitted')
    return query(OPEN_FIELDS)
  }
}

async function fetchOpenStatus(): Promise<Record<string, OpenStatus>> {
  try {
    const teams = await fetchOpenTeams()
    const out: Record<string, OpenStatus> = {}
    for (const t of teams) {
      if (t.name) {
        out[t.name] = {
          id: String(t.id),
          open: t.open_for_players === true,
          girls: t.open_for_girls === true,
          boys: t.open_for_boys === true,
        }
      }
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
export function codesFromLabel(label: string): string[] {
  const out = new Set<string>()
  for (const m of (label ?? '').matchAll(CODE_TOKEN)) {
    out.add(`${m[1].toUpperCase()}U${Number(m[2])}`)
  }
  return [...out]
}

/**
 * Which teams a training slot belongs to. The `teams` M2M is authoritative and
 * resolves to exact team NAMES — which is what tells the two U18 girls' squads
 * apart, where an age code could not.
 *
 * The label is free text and gets it wrong in both directions: "BB - DU18"
 * cannot say which of the two squads it means, and "BB - U14-U18+" parses to
 * nothing at all even though the booking is linked to HU16. It is used only
 * when a slot carries no team link, and then only as an age code — every team
 * in that group gets the line.
 */
export function slotTargets(slot: DirectusSlot): { names: string[]; codes: string[] } {
  const names = (slot.teams ?? [])
    .map(t => t?.teams_id?.name)
    .filter((n): n is string => !!n)
  return names.length
    ? { names: [...new Set(names)], codes: [] }
    : { names: [], codes: codesFromLabel(slot.label) }
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
          'valid_from', 'valid_until', 'indefinite',
          'teams.teams_id.name',
        ],
      }),
      fetchWaitlist(),
      fetchOpenStatus(),
    ])

    // One entry per Directus youth team, keyed by its name — the only key that
    // separates two squads sharing an age group (DU18 Spark vs DU18 Fire).
    const byName = new Map<string, YouthTeamInfo>()
    const codeOf = new Map<string, string>()

    for (const t of teams) {
      const code = cardCode(t.name)
      if (!code || byName.has(t.name)) continue
      const coaches = (t.coach ?? [])
        .map(c => c?.members_id)
        .filter((m): m is { first_name: string; last_name: string } => !!m)
        .map(m => `${m.first_name} ${m.last_name}`.trim())
      byName.set(t.name, { coaches, slots: [], name: t.name })
      codeOf.set(t.name, code)
    }

    /** Every team a slot applies to: exact links, else the label's age group. */
    const targetsOf = (s: DirectusSlot): YouthTeamInfo[] => {
      const { names, codes } = slotTargets(s)
      if (names.length) {
        return names.map(n => byName.get(n)).filter((i): i is YouthTeamInfo => !!i)
      }
      return [...byName].filter(([n]) => codes.includes(codeOf.get(n)!)).map(([, i]) => i)
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const s of slots) {
      if (!isCurrentOrUpcoming(s, today)) continue
      const validUntil = s.indefinite ? '' : (s.valid_until ?? '').slice(0, 10)
      for (const info of targetsOf(s)) {
        info.slots.push({
          day: s.day_of_week,
          start: hhmm(s.start_time),
          end: hhmm(s.end_time),
          hall: s.hall?.name ?? '',
          ...(validUntil ? { validUntil } : {}),
        })
      }
    }

    for (const info of byName.values()) info.slots = dedupeSlots(info.slots)

    for (const [name, w] of Object.entries(waitlist)) {
      const info = byName.get(name)
      if (!info) continue
      info.waitlistUrl = w.url
      if (w.label) info.waitlistLabel = w.label
    }

    for (const [name, o] of Object.entries(openStatus)) {
      const info = byName.get(name)
      if (!info) continue
      info.teamId = o.id
      info.openForPlayers = o.open
      info.openForGirls = o.girls
      info.openForBoys = o.boys
    }

    // Closed team with no link of its own → club-wide waiting list.
    // `=== false` is deliberate: openForPlayers stays undefined when the status
    // fetch failed, and an unknown status must not flip every card to "full".
    for (const info of byName.values()) {
      if (!info.waitlistUrl && info.openForPlayers === false) {
        info.waitlistUrl = DEFAULT_WAITLIST_URL
      }
    }

    // Group into age sections. Sorted by name so a section holding two squads
    // (DU18 Fire before DU18 Spark) renders in the same order every build.
    const data: YouthBasketball = {}
    for (const name of [...byName.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
      (data[codeOf.get(name)!] ??= []).push(byName.get(name)!)
    }
    return data
  } catch (err) {
    console.warn('[youthBasketball] live fetch failed — cards render without coach/training:', err)
    return {}
  }
}
