/**
 * Shared utility functions for KSCW website
 * Extracted from public/js/data.js for reuse across components and islands
 */

/** Club timezone — all dates render as the wall-clock day in Zurich. */
const CLUB_TZ = 'Europe/Zurich';

/**
 * Resolve an ISO date string to the `Date` instant whose Europe/Zurich
 * calendar day equals the day the value represents.
 *
 * - Full timestamps (e.g. `2026-08-21T22:00:00.000Z`) are true UTC instants:
 *   an all-day event authored as Zurich midnight is stored as the *previous*
 *   day 22:00Z in summer. Slicing the string would land it on the wrong day,
 *   so we keep the instant and let callers render it with `timeZone: CLUB_TZ`.
 * - Date-only strings (e.g. `2026-08-22`) carry no time; we anchor them at noon
 *   UTC so the ±1–2h Zurich offset can never shift them across a day boundary.
 */
function toClubInstant(isoDate: string): Date {
  return isoDate.length <= 10 ? new Date(isoDate + 'T12:00:00Z') : new Date(isoDate);
}

/**
 * Format ISO date string as Swiss-style `dd.mm.yyyy` regardless of caller
 * locale. Hardcoded to `de-CH`: passing 'en-CH' would yield slashes
 * (`30/03/2026`), which mixes formats across the site for English visitors.
 * App-wide convention is dd.mm.yyyy — see wiedisync `INFRA.md → Time &
 * Date Formatting`. The day is resolved in `Europe/Zurich`, so full UTC
 * timestamps (e.g. all-day events) render on their intended local day.
 * @param isoDate ISO date string (`YYYY-MM-DD` or full ISO timestamp)
 * @param _locale Ignored; retained for backwards compatibility with old
 *   callers that passed 'en-CH'. New callers should omit.
 * @returns Formatted date (e.g., "30.03.2026")
 */
export function formatDate(isoDate: string, _locale?: string): string {
  void _locale;
  if (!isoDate) return '–';

  try {
    return toClubInstant(isoDate).toLocaleDateString('de-CH', {
      timeZone: CLUB_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '–';
  }
}

/**
 * Format ISO date string as long locale-specific date with weekday.
 * Day resolved in `Europe/Zurich` (see {@link formatDate}).
 * @param isoDate ISO date string (`YYYY-MM-DD` or full ISO timestamp)
 * @param locale Locale code (default: 'de-CH')
 * @returns Formatted date (e.g., "So, 30. März 2026" for de-CH)
 */
export function formatDateLong(isoDate: string, locale = 'de-CH'): string {
  if (!isoDate) return '–';

  try {
    return toClubInstant(isoDate).toLocaleDateString(locale, {
      timeZone: CLUB_TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '–';
  }
}

/**
 * Format time string to HH:MM
 * @param time Time string (HH:MM:SS or HH:MM)
 * @returns Formatted time (e.g., "17:00")
 */
export function formatTime(time: string): string {
  if (!time) return '';
  return time.slice(0, 5);
}

/**
 * Format a true ISO instant as Swiss `dd.mm.yyyy HH:MM` (24h) in Europe/Zurich.
 * For moments that carry a time of day — a sign-up deadline, a submission
 * timestamp — where {@link formatDate} would drop the half that matters.
 * Hardcoded to `de-CH` for the same reason as {@link formatDate}: 'en-CH' gives
 * slashes and 'en-US' an am/pm clock, both inconsistent with the rest of the
 * site. de-CH renders "12.08.2026, 00:00"; the comma is dropped to match the
 * platform's `dd.mm.yyyy HH:MM`.
 * @param iso Full ISO timestamp (a date-only string has no meaningful time and
 *   renders at its Zurich noon anchor — use formatDate for those)
 * @returns Formatted instant (e.g., "12.08.2026 00:00")
 */
export function formatDateTime(iso: string): string {
  if (!iso) return '–';

  try {
    return toClubInstant(iso).toLocaleString('de-CH', {
      timeZone: CLUB_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');
  } catch {
    return '–';
  }
}

/**
 * Determine if a game is a win for KSCW
 * @param homeScore Home team score
 * @param awayScore Away team score
 * @param isHome Whether KSCW is the home team
 * @returns true if KSCW won, false otherwise
 */
export function isWin(homeScore: number, awayScore: number, isHome: boolean): boolean {
  return isHome ? homeScore > awayScore : awayScore > homeScore;
}

/**
 * Generate a unique key for a league
 * @param sport Sport name (e.g., 'volleyball', 'basketball')
 * @param league League name (e.g., '1. Liga', 'Damen 2')
 * @returns League key (e.g., 'volleyball_1_liga')
 */
export function getLeagueKey(sport: string, league: string): string {
  return `${sport}_${league}`.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 * @returns Today's date as ISO string
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
