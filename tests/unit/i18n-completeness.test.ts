import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

// /admin carries its OWN dictionary, inline in admin.astro — it is not part of the
// public i18n engine and so was covered by none of the above. A key present in one
// language and not the other does not fail loudly: t() falls through and the admin sees
// the raw key ("scExamNoteLabel") sitting in the UI.
describe('admin.astro inline i18n', () => {
  const SRC = readFileSync('src/pages/admin.astro', 'utf8');

  function loadDicts(): { de: Record<string, string>; en: Record<string, string> } {
    const start = SRC.indexOf('var i18n = {');
    expect(start, 'admin i18n object not found').toBeGreaterThan(-1);
    // Object literal ends at the first line that closes it at this indentation.
    const end = SRC.indexOf('\n    };', start);
    expect(end, 'admin i18n object end not found').toBeGreaterThan(-1);
    const code = SRC.slice(start, end + '\n    };'.length);
    return new Function(`${code}\nreturn i18n;`)();
  }

  const dicts = loadDicts();

  it('parses both language dictionaries', () => {
    expect(Object.keys(dicts.de).length).toBeGreaterThan(100);
    expect(Object.keys(dicts.en).length).toBeGreaterThan(100);
  });

  it('every DE key exists in EN', () => {
    const missing = Object.keys(dicts.de).filter((k) => !(k in dicts.en));
    expect(missing, `Missing in admin en: ${missing.join(', ')}`).toEqual([]);
  });

  it('every EN key exists in DE', () => {
    const missing = Object.keys(dicts.en).filter((k) => !(k in dicts.de));
    expect(missing, `Missing in admin de: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no empty values', () => {
    const empty = Object.entries(dicts.de).concat(Object.entries(dicts.en))
      .filter(([, v]) => String(v).trim() === '').map(([k]) => k);
    expect(empty, `Empty admin i18n values: ${empty.join(', ')}`).toEqual([]);
  });

  // These carry {name}/{who}/{count}/{names} placeholders that the caller substitutes.
  // A placeholder dropped in translation is invisible until the string renders with a
  // literal gap where the participant's name should be.
  it('keeps interpolation placeholders in both languages', () => {
    for (const [key, deVal] of Object.entries(dicts.de)) {
      const placeholders = (String(deVal).match(/\{[a-z]+\}/gi) || []).sort();
      if (!placeholders.length) continue;
      const enPlaceholders = (String(dicts.en[key]).match(/\{[a-z]+\}/gi) || []).sort();
      expect(enPlaceholders, `placeholder mismatch on '${key}'`).toEqual(placeholders);
    }
  });
});
