import { describe, it, expect } from 'vitest';
import { t } from '../../src/lib/i18n';

// NOTE: getLocaleFromUrl()/getAlternateUrl() were removed in the single-URL
// refactor (commit 1f904a7). The site no longer routes locale via a /de//en/
// path prefix — language lives in localStorage and is swapped client-side by
// public/js/i18n.js — so those helpers (and their tests) no longer apply. The
// t() guard below covers the surviving build-time i18n lookup API.
describe('t()', () => {
  it('returns German string for DE locale', () => {
    expect(t('de', 'navClub')).toBe('Club');
  });

  it('returns English string for EN locale', () => {
    // Sentence case per the KSCW capitalisation convention (audit UI-WEB-2).
    expect(t('en', 'navAbout')).toBe('About us');
  });

  it('returns the key when it exists in neither locale', () => {
    expect(t('en', 'nonExistentKey12345')).toBe('nonExistentKey12345');
  });

  it('returns the key itself when not found in any locale', () => {
    expect(t('de', 'totallyFakeKey')).toBe('totallyFakeKey');
  });
});
