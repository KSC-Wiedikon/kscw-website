/**
 * Scorer-course sign-up sessions — single source of truth.
 *
 * Surfaced on /de|/en/weiteres/schreiberkurse at build time and to /admin
 * via /scorer-courses.json. Each session has a DE+EN OpnForm form pair on
 * forms.kscw.ch; the EN form is a duplicate of the DE form so field slugs
 * match (required for the unified submissions table). Adding a course =
 * one entry here + one OpnForm form pair. No backend/schema change.
 */

export type ScorerCourseMode = 'in_person' | 'recorded' | 'both';

export interface ScorerCourse {
  /** Stable id used for CSV filenames and keys. */
  id: string;
  titleDe: string;
  titleEn: string;
  /** ISO yyyy-mm-dd, or null when the date is not yet announced. */
  dateISO: string | null;
  /** 24h HH:MM, or null. */
  time: string | null;
  mode: ScorerCourseMode;
  /** OpnForm slug for the German form, or null until built. */
  formSlugDe: string | null;
  /** OpnForm slug for the English form, or null until built. */
  formSlugEn: string | null;
}

/**
 * Seeded sessions. The 08.07.2026 EN course: fill `formSlugEn` with the real
 * OpnForm slug once the form pair is built (Task 8). Add the DE course as a
 * second entry when its date + slug are known.
 */
export const scorerCourses: ScorerCourse[] = [
  {
    id: '2026-07-08-en',
    titleDe: 'Volleyball-Schreiberkurs (Englisch)',
    titleEn: 'Volleyball scorer course (English)',
    dateISO: '2026-07-08',
    time: '19:00',
    mode: 'in_person',
    formSlugDe: null,
    formSlugEn: null, // ← set to the real OpnForm slug in Task 8
  },
];

export function localeSlug(c: ScorerCourse, locale: 'de' | 'en'): string | null {
  return locale === 'en' ? c.formSlugEn : c.formSlugDe;
}

/**
 * Accepts either a bare OpnForm slug ("scorer-2026-07-08-en") or a full
 * forms.kscw.ch form URL ("https://forms.kscw.ch/forms/<slug>") and returns
 * the bare slug. Idempotent for already-bare slugs; null/empty → null.
 * Strips any query string, hash, or trailing slash.
 */
export function normalizeFormSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const m = v.match(/\/forms\/([^/?#]+)/i);
  const slug = (m ? m[1] : v).replace(/^\/+/, '').replace(/[/?#].*$/, '').trim();
  return slug || null;
}

/**
 * Upcoming = date in the future OR not yet announced (null date).
 * Sorted ascending by date; null-date entries last.
 */
export function getUpcomingScorerCourses(
  courses: ScorerCourse[] = scorerCourses,
  now: Date = new Date(),
): ScorerCourse[] {
  // Compare on the calendar day in Europe/Zurich, host-TZ-independent.
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' }); // yyyy-mm-dd
  return courses
    .filter(c => c.dateISO == null || c.dateISO >= todayISO)
    .sort((a, b) => {
      if (a.dateISO == null) return 1;
      if (b.dateISO == null) return -1;
      return a.dateISO.localeCompare(b.dateISO);
    });
}
