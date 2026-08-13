/**
 * Which birth years a youth age category is open to.
 *
 * Both federations name a category by the age a player has to stay UNDER, but
 * they count it from opposite ends of the season — and that single-year offset is
 * the whole reason the two sports disagree:
 *
 *   **Swiss Basketball** counts from the season's FIRST calendar year and
 *   publishes exactly two Jahrgänge per category. U18 in 2026/27 is 2009 + 2010,
 *   U16 is 2011 + 2012, down to U8 = 2019 + 2020.
 *
 *   **Swiss Volley** counts from the SECOND, and publishes every category
 *   open-ended. "Übersicht Alterkategorien und Lizenzen, Saison 2025/26" lists
 *   U16 2011+, U18 2009+, U20 2007+, U23 2004+ — so the same U-number lands one
 *   year later than in basketball. Open-ended is not a rounding of the rule: a
 *   U20 squad genuinely fields 15-year-olds, so the site says "Jahrgang 2008 und
 *   jünger" rather than inventing an upper bound the federation does not set.
 *
 * Everything shifts by one on 1 August, when the new season's categories take
 * effect. Nothing rebuilds this site on a date alone — the Directus auto-rebuild
 * Flow only fires on content edits — so a build from July would keep last
 * season's years all through August. public/js/birth-years.js recomputes them in
 * the browser on every page load for exactly that reason; the build-time render
 * stays as the instant-paint / no-JS fallback. The two are kept in agreement by
 * tests/unit/birth-years.test.ts.
 */

export type Sport = 'basketball' | 'volleyball'

/**
 * The season a date belongs to, named by its first calendar year: 2026 means
 * 2026/27. Reckoned in UTC so the build (CI, UTC) and the browser (CH, UTC+2 in
 * summer) never disagree about which season it is — the cost is that the flip
 * lands at 02:00 local on 1 August rather than midnight.
 */
export function seasonStartYear(now: Date): number {
  // getUTCMonth() is 0-based: 7 = August.
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
}

export interface BirthYears {
  /** Oldest eligible birth year. */
  from: number
  /** Youngest year listed. `from + 1` for a plain two-Jahrgang category. */
  to: number
  /** Younger players are eligible too — volleyball's open-ended categories. */
  andYounger: boolean
}

// How far the oldest eligible Jahrgang sits from `seasonYear - age`; see the
// federation rules in the file header.
const OFFSET: Record<Sport, number> = { basketball: 1, volleyball: 2 }

/**
 * @param age       the category's U-number (18 for U18)
 * @param spanTo    lowest age group these years also cover, for a card that
 *                  absorbs the group below it (basketball only — see
 *                  groupSpanTo() in lib/fetch/youthBasketball.ts). Defaults to
 *                  `age`, i.e. the category's own two Jahrgänge.
 */
export function birthYears(
  sport: Sport,
  age: number,
  seasonYear: number,
  spanTo: number = age,
): BirthYears {
  const from = seasonYear - age + OFFSET[sport]
  // Volleyball is open-ended downwards, so there is no second bound to compute.
  if (sport === 'volleyball') return { from, to: from, andYounger: true }
  // Two Jahrgänge per group: absorbing U16 under U18 adds that group's two.
  const span = spanTo < age ? spanTo : age
  return { from, to: seasonYear - span + OFFSET[sport] + 1, andYounger: false }
}

/**
 * The years themselves, language-neutral: "2009, 2010" for a category's own two,
 * "2009–2012" once a card absorbs the group below, "2005" when the label carries
 * "und jünger" instead of a second bound.
 */
export function formatBirthYears(y: BirthYears): string {
  if (y.andYounger || y.to <= y.from) return String(y.from)
  if (y.to === y.from + 1) return `${y.from}, ${y.to}`
  return `${y.from}–${y.to}`
}

// ── Years stated by hand for one team ──────────────────────────────────────

/**
 * What a single team says its own Jahrgänge are, when the category rule above
 * gets it wrong for that squad.
 *
 * The rule is right about the CATEGORY and can only ever be right about the
 * category: Swiss Basketball's U18 is 2009 + 2010 in 2026/27, and groupSpanTo()
 * widens a card when the club runs no team one step down. A squad is a different
 * question — DU18 Spark carries a 2008-born player, which no federation table
 * and no roster the website can read will ever say (members.birthdate is not
 * public, and publishing minors' birthdates to fix a label would be a bad
 * trade). So these are written down by hand, from what the club states in
 * wiedisync.
 *
 * `season` is what makes them survive a season change instead of quietly rotting:
 * the years are stored as stated FOR that season and shifted by the difference
 * to the current one, so every 1 August they move up by one on their own, exactly
 * like the derived line next to them. A squad that keeps a genuinely fixed year
 * would need a different mechanism — none does, so there isn't one.
 *
 * Keyed by `teams.name` as Directus spells it (case and inner spacing are
 * normalised, nothing else). A rename in Directus therefore drops the override
 * and the card falls back to the derived range: wrong-but-plausible beats
 * silently attaching another team's years to a renamed squad.
 *
 * Mirrored in public/js/birth-years.js — tests/unit/birth-years.test.ts fails if
 * the two copies drift.
 */
export interface TeamBirthYears {
  /** Season the years were stated for, named by its first calendar year. */
  season: number
  /** The eligible Jahrgänge as stated, oldest first. */
  years: number[]
}

export const TEAM_BIRTH_YEARS: Record<string, TeamBirthYears> = {
  // Stated by the club for 2026/27. Spark takes a player a year above the
  // category; Fire matches the derived U18 + absorbed-U16 range and is listed
  // anyway, so the pair is read and maintained together.
  'DU18 SPARK': { season: 2026, years: [2008, 2009, 2010, 2011, 2012] },
  'DU18 FIRE': { season: 2026, years: [2009, 2010, 2011, 2012] },
}

/** Lookup key for a team name: upper-case, inner whitespace collapsed. */
export function teamKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * The hand-written Jahrgänge for a team, shifted to `seasonYear`, or null when
 * the team has none and the category rule stands.
 */
export function teamBirthYears(
  name: string | null | undefined,
  seasonYear: number,
): number[] | null {
  const entry = TEAM_BIRTH_YEARS[teamKey(name)]
  if (!entry) return null
  const shift = seasonYear - entry.season
  return entry.years.map(y => y + shift)
}

/**
 * An explicit list of years in the same shapes formatBirthYears() produces, so
 * an overridden card and a derived one next to it read identically: "2009",
 * "2009, 2010", "2008–2012", and a comma list if the years ever have a gap.
 */
export function formatYearList(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b)
  if (!sorted.length) return ''
  if (sorted.length === 1) return String(sorted[0])
  if (sorted.length === 2) return `${sorted[0]}, ${sorted[1]}`
  const consecutive = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1)
  return consecutive ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ')
}

/**
 * The U-number in a team name or chip label — "DU23-1" → 23, "BB-HU18" → 18,
 * "Damen U23-1" → 23. Returns null for adult teams (D1, Legends, Lions), which
 * is what gates the whole line: they have no age category to state.
 *
 * Deliberately no \b before the U — the gender prefix in "HU18" is a word
 * character, so a boundary there matches nothing and every basketball youth
 * label silently loses its line.
 */
export function youthAge(name: string | null | undefined): number | null {
  const m = /U\s*0*(\d+)/i.exec(name ?? '')
  return m ? Number(m[1]) : null
}
