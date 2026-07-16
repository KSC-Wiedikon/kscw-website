import { describe, it, expect } from 'vitest';
import { scorerCourses, getUpcomingScorerCourses, isRegistrationClosed, localeSlug, normalizeFormSlug, type ScorerCourse } from 'src/data/scorer-courses';

const base: ScorerCourse = {
  id: 't', titleDe: 'Kurs', titleEn: 'Course',
  dateISO: '2026-07-08', time: '18:00', mode: 'in_person',
  formSlugDe: null, formSlugEn: 'schreiberkurs-2026-07-08-en',
};

describe('scorer-courses data', () => {
  it('every course has a stable id and at least one locale title', () => {
    for (const c of scorerCourses) {
      expect(c.id, 'missing id').toBeTruthy();
      expect(c.titleDe && c.titleEn, `missing titles for ${c.id}`).toBeTruthy();
      expect(['in_person', 'recorded', 'both']).toContain(c.mode);
    }
  });

  it('getUpcomingScorerCourses keeps null-date (TBA) and future, drops past, sorts by date', () => {
    const tba = { ...base, id: 'tba', dateISO: null };
    const past = { ...base, id: 'past', dateISO: '2020-01-01' };
    const future = { ...base, id: 'future', dateISO: '2099-01-01' };
    const soon = { ...base, id: 'soon', dateISO: '2030-01-01' };
    const out = getUpcomingScorerCourses([past, future, tba, soon], new Date('2026-06-01'));
    expect(out.map(c => c.id)).toEqual(['soon', 'future', 'tba']);
  });

  it('localeSlug returns the preferred slug, falling back to the other language', () => {
    expect(localeSlug(base, 'en')).toBe('schreiberkurs-2026-07-08-en');
    // DE form not built yet → intentionally falls back to the field-compatible
    // EN form rather than hiding the sign-up button (see localeSlug docstring).
    expect(localeSlug(base, 'de')).toBe('schreiberkurs-2026-07-08-en');
    // null only when neither language has a form.
    expect(localeSlug({ ...base, formSlugEn: null }, 'de')).toBeNull();
  });

  it('normalizeFormSlug extracts the bare slug from a full forms.kscw.ch URL', () => {
    expect(normalizeFormSlug('https://forms.kscw.ch/forms/scorer-kurse-2026-en-l3tcje'))
      .toBe('scorer-kurse-2026-en-l3tcje');
    expect(normalizeFormSlug('http://forms.kscw.ch/forms/abc-123/')).toBe('abc-123');
    expect(normalizeFormSlug('https://forms.kscw.ch/forms/abc-123?foo=1#x')).toBe('abc-123');
  });

  it('isRegistrationClosed flips exactly at the deadline instant', () => {
    const c = { ...base, registrationCloses: '2026-08-11T22:00:00.000Z' };
    expect(isRegistrationClosed(c, new Date('2026-08-11T21:59:59Z'))).toBe(false);
    // Deadline is inclusive — at the stated instant sign-up is over.
    expect(isRegistrationClosed(c, new Date('2026-08-11T22:00:00Z'))).toBe(true);
    expect(isRegistrationClosed(c, new Date('2026-08-11T22:00:01Z'))).toBe(true);
  });

  it('isRegistrationClosed compares real instants, not wall-clock strings', () => {
    // Same moment written three ways (UTC, CEST +02:00, CET +01:00 in winter).
    const summer = { ...base, registrationCloses: '2026-08-12T00:00:00+02:00' };
    expect(isRegistrationClosed(summer, new Date('2026-08-11T21:59:00Z'))).toBe(false);
    expect(isRegistrationClosed(summer, new Date('2026-08-11T22:00:00Z'))).toBe(true);
    const winter = { ...base, registrationCloses: '2026-01-15T09:00:00+01:00' };
    expect(isRegistrationClosed(winter, new Date('2026-01-15T07:59:00Z'))).toBe(false);
    expect(isRegistrationClosed(winter, new Date('2026-01-15T08:00:00Z'))).toBe(true);
  });

  it('isRegistrationClosed treats no deadline and junk as open', () => {
    // A course with no deadline stays open right up to its date; an unparseable
    // value must not silently hide a live sign-up button.
    expect(isRegistrationClosed(base, new Date('2099-01-01'))).toBe(false);
    expect(isRegistrationClosed({ ...base, registrationCloses: null }, new Date('2099-01-01'))).toBe(false);
    expect(isRegistrationClosed({ ...base, registrationCloses: '' }, new Date('2099-01-01'))).toBe(false);
    expect(isRegistrationClosed({ ...base, registrationCloses: 'not a date' }, new Date('2099-01-01'))).toBe(false);
  });

  it('a closed course is still listed — the lock is not a hide', () => {
    // Closing sign-up must not remove the card; only the course date does that.
    const closed = { ...base, id: 'closed', dateISO: '2030-06-01', registrationCloses: '2020-01-01T00:00:00Z' };
    const out = getUpcomingScorerCourses([closed], new Date('2026-06-01'));
    expect(out.map(c => c.id)).toEqual(['closed']);
    expect(isRegistrationClosed(closed, new Date('2026-06-01'))).toBe(true);
  });

  it('normalizeFormSlug is idempotent for already-bare slugs and null-safe', () => {
    expect(normalizeFormSlug('scorer-2026-07-08-en')).toBe('scorer-2026-07-08-en');
    expect(normalizeFormSlug(null)).toBeNull();
    expect(normalizeFormSlug('')).toBeNull();
    expect(normalizeFormSlug('   ')).toBeNull();
  });
});
