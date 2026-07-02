import { describe, it, expect } from 'vitest';
// The translation dictionaries live under public/js/i18n (loaded at runtime by
// public/js/i18n.js and at build time via src/lib/i18n.ts) — not src/i18n.
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';

describe('i18n completeness', () => {
  const deKeys = Object.keys(de);
  const enKeys = Object.keys(en);

  it('every DE key exists in EN', () => {
    const missing = deKeys.filter((k) => !(k in en));
    expect(missing, `Missing in en.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('every EN key exists in DE', () => {
    const missing = enKeys.filter((k) => !(k in de));
    expect(missing, `Missing in de.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('no empty string values in DE', () => {
    const empty = deKeys.filter((k) => (de as Record<string, string>)[k].trim() === '');
    expect(empty, `Empty values in de.json: ${empty.join(', ')}`).toEqual([]);
  });

  it('no empty string values in EN', () => {
    const empty = enKeys.filter((k) => (en as Record<string, string>)[k].trim() === '');
    expect(empty, `Empty values in en.json: ${empty.join(', ')}`).toEqual([]);
  });

  it('flags identical DE/EN values (potential untranslated strings)', () => {
    const allowlist = new Set([
      'navNews', 'navClub', 'navVolleyball', 'navBasketball',
      'homeTitle', 'partnerFunctiomed',
    ]);

    const identical = deKeys.filter((k) => {
      if (allowlist.has(k)) return false;
      return (de as Record<string, string>)[k] === (en as Record<string, string>)[k];
    });

    if (identical.length > 0) {
      console.warn(
        `Potentially untranslated keys (DE === EN): ${identical.join(', ')}`
      );
    }
  });
});
