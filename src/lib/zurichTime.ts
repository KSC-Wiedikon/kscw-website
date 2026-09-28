/**
 * Europe/Zurich wall-clock helpers.
 *
 * The club lives in one timezone and every "today" on the site means the Zurich
 * day. `new Date().toISOString().slice(0, 10)` is the UTC day instead, which is
 * still yesterday between midnight and 01:00 (CET) / 02:00 (CEST) — so a
 * training, slot or event ending "today" was treated as past or still-upcoming a
 * couple of hours off (audit 2026-09-28, F-53). Everything that needs today's
 * date goes through {@link zurichToday}; the unbundled public/js scripts use the
 * same `toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' })` expression,
 * and tests/unit/public-runtime-audit-2026-09-28.test.ts (F-53) forbids the UTC form in both trees.
 */

const CLUB_TZ = 'Europe/Zurich'

/** Today's date in Zurich as `YYYY-MM-DD` (en-CA formats ISO-style). */
export function zurichToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: CLUB_TZ })
}

/**
 * Normalise an admin-typed time of day to `HH:MM`, or `null` when it is not one.
 *
 * Accepts `18:00`, `8:00`, `18:00:00` (Postgres), and the common Swiss `18.00`
 * and `18h00`. Before this, "18.00" reached `zurichToUTC` as NaN, the calendar
 * link's `formatToParts` threw a RangeError inside the render, and the whole
 * scorer-course section stayed hidden with no message (audit 2026-09-28, F-11).
 */
export function normalizeHHMM(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{1,2})\s*[:.hH]\s*(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mi = Number(m[2])
  if (hh > 23 || mi > 59) return null
  return `${String(hh).padStart(2, '0')}:${m[2]}`
}

/**
 * Wall-clock Europe/Zurich → exact UTC instant, DST-safe (the CET/CEST offset is
 * resolved for the given date via Intl, not hard-coded).
 *
 * @returns the instant, or `null` when the date or time does not parse. A null
 *   return is the caller's cue to skip whatever needed the instant; it used to
 *   be an Invalid Date that threw one call later.
 */
export function zurichToUTC(dateISO: string, hhmm: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateISO ?? ''))
  const time = normalizeHHMM(hhmm)
  if (!dm || !time) return null
  const [y, m, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [hh, mi] = time.split(':').map(Number)
  const asUTC = Date.UTC(y, m - 1, d, hh, mi, 0)
  if (!Number.isFinite(asUTC)) return null
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(asUTC))
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>
  const hour = p.hour === '24' ? '00' : p.hour
  const zurichAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second)
  const out = asUTC - (zurichAsUTC - asUTC)
  return Number.isFinite(out) ? new Date(out) : null
}
