import { describe, it, expect } from 'vitest';
import { t } from '../../src/lib/i18n';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';

// NOTE: getLocaleFromUrl()/getAlternateUrl() were removed in the single-URL
// refactor (commit 1f904a7). The site no longer routes locale via a /de//en/
// path prefix — language lives in localStorage and is swapped client-side by
// public/js/i18n.js — so those helpers (and their tests) no longer apply. The
// t() guard below covers the surviving build-time i18n lookup API.
//
// These assertions deliberately compare against the DICTIONARY, never against
// literal copy. They used to read `expect(t('de','navClub')).toBe('Club')`,
// which coupled the suite to the wording: once these strings become editable
// from /admin, an ordinary content edit would turn CI red for a reason that
// looks nothing like "someone changed a word". What t() owes its callers is
// *which dictionary it reads and how it falls back* — that is what is tested.
//
// (The old DE assertion also proved less than it appeared: `navClub` is the
// string "Club" in both locales, so it would have passed even if t() ignored
// the locale argument entirely. The differing-key test below cannot.)

const dict: Record<string, Record<string, string>> = { de, en };

describe('t()', () => {
  it('reads the DE dictionary for a DE lookup', () => {
    expect(t('de', 'navAbout')).toBe(dict.de.navAbout);
  });

  it('reads the EN dictionary for an EN lookup', () => {
    expect(t('en', 'navAbout')).toBe(dict.en.navAbout);
  });

  it('resolves the two locales independently', () => {
    // Any key whose translations genuinely differ proves the locale argument
    // is honoured. Picking it dynamically keeps the test alive as copy changes.
    const differing = Object.keys(dict.de).find(
      (k) => typeof dict.de[k] === 'string' && dict.de[k] !== dict.en[k]
    );
    expect(differing, 'no key differs between DE and EN — the fixture is wrong').toBeTruthy();
    expect(t('de', differing as string)).not.toBe(t('en', differing as string));
  });

  it('falls back to German when a key is missing from English', () => {
    // src/lib/i18n.ts: translations[locale]?.[key] ?? translations.de[key] ?? key
    const deOnly = Object.keys(dict.de).find((k) => !(k in dict.en));
    if (deOnly === undefined) {
      // Parity is currently complete, which no-i18n-html.test.ts enforces.
      // Exercise the same branch through a locale that has no dictionary.
      expect(t('fr' as 'de', 'navAbout')).toBe(dict.de.navAbout);
      return;
    }
    expect(t('en', deOnly)).toBe(dict.de[deOnly]);
  });

  it('returns the key itself when it exists in neither locale', () => {
    expect(t('en', 'nonExistentKey12345')).toBe('nonExistentKey12345');
    expect(t('de', 'totallyFakeKey')).toBe('totallyFakeKey');
  });

  it('never returns undefined for a key that exists', () => {
    for (const key of Object.keys(dict.de).slice(0, 50)) {
      expect(typeof t('de', key)).toBe('string');
      expect(typeof t('en', key)).toBe('string');
    }
  });
});
