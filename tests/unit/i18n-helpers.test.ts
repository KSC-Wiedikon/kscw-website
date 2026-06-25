import { describe, it, expect } from 'vitest';
import { t, getLocaleFromUrl, getAlternateUrl } from '../../src/lib/i18n';

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

describe('getLocaleFromUrl()', () => {
  it('returns de for /de/ paths', () => {
    expect(getLocaleFromUrl(new URL('http://localhost/de/club/kontakt'))).toBe('de');
  });

  it('returns en for /en/ paths', () => {
    expect(getLocaleFromUrl(new URL('http://localhost/en/club/kontakt'))).toBe('en');
  });

  it('defaults to de for unknown locale', () => {
    expect(getLocaleFromUrl(new URL('http://localhost/fr/something'))).toBe('de');
  });
});

describe('getAlternateUrl()', () => {
  it('swaps /de/ to /en/', () => {
    expect(getAlternateUrl(new URL('http://localhost/de/club/kontakt'))).toBe('/en/club/kontakt');
  });

  it('swaps /en/ to /de/', () => {
    expect(getAlternateUrl(new URL('http://localhost/en/club/kontakt'))).toBe('/de/club/kontakt');
  });

  it('handles root locale paths', () => {
    expect(getAlternateUrl(new URL('http://localhost/de/'))).toBe('/en/');
  });
});
