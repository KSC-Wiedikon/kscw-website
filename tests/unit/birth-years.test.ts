/**
 * Eligible Jahrgänge on the youth pages.
 *
 * The numbers here are the ones the club's youth head gave for 2026/27, and they
 * are also what the federations publish (Swiss Basketball's two Jahrgänge per
 * category; "Übersicht Alterkategorien und Lizenzen, Saison 2025/26" for Swiss
 * Volley's open-ended ones). They are asserted as literals rather than recomputed
 * from the formula, because a formula that agrees with itself proves nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  birthYears,
  formatBirthYears,
  seasonStartYear,
  youthAge,
  type Sport,
} from '../../src/lib/birthYears';
import { groupSpanTo } from '../../src/lib/fetch/youthBasketball';

const line = (sport: Sport, age: number, seasonYear: number, spanTo?: number) =>
  formatBirthYears(birthYears(sport, age, seasonYear, spanTo));

describe('season year', () => {
  it('flips on 1 August', () => {
    expect(seasonStartYear(new Date('2026-07-31T23:59:59Z'))).toBe(2025);
    expect(seasonStartYear(new Date('2026-08-01T00:00:00Z'))).toBe(2026);
    expect(seasonStartYear(new Date('2026-12-31T23:59:59Z'))).toBe(2026);
    expect(seasonStartYear(new Date('2027-01-01T00:00:00Z'))).toBe(2026);
  });
});

describe('basketball Jahrgänge (2026/27)', () => {
  // Exactly the list the youth head gave for this season.
  it.each([
    [8, '2019, 2020'],
    [10, '2017, 2018'],
    [12, '2015, 2016'],
    [14, '2013, 2014'],
    [16, '2011, 2012'],
    [18, '2009, 2010'],
  ])('U%i is %s', (age, expected) => {
    expect(line('basketball', age, 2026)).toBe(expected);
  });

  it('reads 2009–2012 for the U18 girls, who also take the missing U16 group', () => {
    expect(line('basketball', 18, 2026, 16)).toBe('2009–2012');
  });

  it('shifts by one with the season', () => {
    expect(line('basketball', 18, 2027)).toBe('2010, 2011');
    expect(line('basketball', 8, 2025)).toBe('2018, 2019');
  });
});

describe('volleyball Jahrgänge', () => {
  // Swiss Volley publishes these open-ended and one year later than basketball's
  // same-numbered category — a U20 squad really does field 15-year-olds.
  it('matches the federation table for 2025/26', () => {
    expect(line('volleyball', 16, 2025)).toBe('2011');
    expect(line('volleyball', 18, 2025)).toBe('2009');
    expect(line('volleyball', 20, 2025)).toBe('2007');
    expect(line('volleyball', 23, 2025)).toBe('2004');
  });

  it('carries the "und jünger" flag rather than a second bound', () => {
    const y = birthYears('volleyball', 23, 2026);
    expect(y).toEqual({ from: 2005, to: 2005, andYounger: true });
  });

  it('is one year later than basketball for the same U-number', () => {
    for (const age of [16, 18, 20, 23]) {
      expect(birthYears('volleyball', age, 2026).from)
        .toBe(birthYears('basketball', age, 2026).from + 1);
    }
  });

  it('names the KSCW squads for 2026/27', () => {
    expect(line('volleyball', 23, 2026)).toBe('2005'); // DU23-1, DU23-2, HU23
    expect(line('volleyball', 20, 2026)).toBe('2008'); // HU20
  });
});

describe('youthAge', () => {
  it('reads the U-number off the names the site actually uses', () => {
    expect(youthAge('DU23-1')).toBe(23);
    expect(youthAge('HU20')).toBe(20);
    // The gender prefix is a word character, so a \b before the U would match
    // nothing here and every basketball card would silently lose its line.
    expect(youthAge('BB-HU18')).toBe(18);
    expect(youthAge('HU18')).toBe(18);
    expect(youthAge('Damen U23-1')).toBe(23);
    expect(youthAge('MU8')).toBe(8);
    expect(youthAge('DU 18B')).toBe(18);
  });

  it('returns null for the adult teams, which have no age category', () => {
    for (const name of ['D1', 'H2', 'H3', 'D4', 'Legends', 'Lions', 'Rhinos', '', null]) {
      expect(youthAge(name)).toBeNull();
    }
  });
});

describe('groupSpanTo', () => {
  // The 2026/27 basketball roster: two U18 girls' squads, no U16 girls, and mixed
  // teams below U12. DU10 exists in Directus even though the page has no card.
  const ROSTER = ['HU18', 'DU18', 'HU16', 'HU14', 'DU14', 'HU12', 'DU12', 'MU10', 'DU10', 'MU8'];

  it('gives the U18 girls the missing U16 group as well', () => {
    expect(groupSpanTo('DU18', ROSTER)).toBe(16);
  });

  it('leaves every other group at its own two Jahrgänge', () => {
    for (const code of ['HU18', 'HU16', 'HU14', 'DU14', 'HU12', 'DU12', 'MU10', 'MU8']) {
      expect(groupSpanTo(code, ROSTER), code).toBe(Number(code.slice(2)));
    }
  });

  it('treats a Mixed group as covering both genders', () => {
    // HU12 stops at U12 because MU10 exists, even though there is no HU10.
    expect(groupSpanTo('HU12', ROSTER)).toBe(12);
    // Swap MU10 for a girls-only U10 and the boys' U12 card has to take U10 on.
    expect(groupSpanTo('HU12', ROSTER.filter((c) => c !== 'MU10'))).toBe(10);
  });

  it('leaves an age group nobody runs out of it', () => {
    // The ladder is the ages Directus actually holds. A group the club runs for
    // NO gender says nothing about who absorbed those players, so the card keeps
    // its own two Jahrgänge — understating the range rather than widening it on a
    // guess. Absorption is for the case the club is actually in: the group exists
    // (HU16 does) but not for these players (no DU16).
    const noU10 = ROSTER.filter((c) => !c.endsWith('U10'));
    expect(groupSpanTo('HU12', noU10)).toBe(12);
    expect(groupSpanTo('DU12', noU10)).toBe(12);
  });

  it('only counts a Mixed group covered when both halves have somewhere to go', () => {
    expect(groupSpanTo('MU10', ['MU10', 'DU8'])).toBe(8);
    expect(groupSpanTo('MU10', ['MU10', 'DU8', 'HU8'])).toBe(10);
    expect(groupSpanTo('MU10', ['MU10', 'MU8'])).toBe(10);
  });

  it('absorbs several consecutive empty groups', () => {
    expect(groupSpanTo('DU18', ['DU18', 'HU16', 'HU14', 'DU12'])).toBe(14);
  });

  it('never reaches below the youngest group the club runs', () => {
    expect(groupSpanTo('MU8', ROSTER)).toBe(8);
  });

  it('falls back to the category itself when Directus gave nothing', () => {
    // The offline fallback card. Understating the range beats claiming a year
    // nobody is eligible for.
    expect(groupSpanTo('DU18', [])).toBe(18);
  });

  it('ignores codes that are not age groups', () => {
    expect(groupSpanTo('Lions', ROSTER)).toBeNull();
    expect(groupSpanTo('', ROSTER)).toBeNull();
  });
});

/**
 * public/js/birth-years.js holds a copy of this arithmetic, because the categories
 * shift on 1 August and nothing rebuilds the site on a date alone. Two copies drift
 * silently — a static page would then disagree with itself the moment the script
 * ran — so the JS is loaded and run against the same cases as the TypeScript.
 */
describe('the public/js/birth-years.js mirror', () => {
  const src = readFileSync(resolve(__dirname, '../../public/js/birth-years.js'), 'utf8');

  // The IIFE needs a DOM and window to install itself on; jsdom is not in play for
  // this file, so hand it just enough of both to reach window.kscwBirthYears.
  const load = () => {
    const win: Record<string, unknown> = {};
    const doc = { querySelectorAll: () => [] as unknown[] };
    new Function('window', 'document', src)(win, doc);
    return win.kscwBirthYears as {
      seasonStartYear: (d: Date) => number;
      text: (sport: string, age: number, spanTo?: number) => string;
      youthAge: (name: unknown) => number | null;
    };
  };

  it('agrees on the season boundary', () => {
    const js = load();
    expect(js.seasonStartYear(new Date('2026-07-31T23:59:59Z'))).toBe(2025);
    expect(js.seasonStartYear(new Date('2026-08-01T00:00:00Z'))).toBe(2026);
  });

  it('agrees on every category the site renders', () => {
    const js = load();
    const season = seasonStartYear(new Date());
    const cases: Array<[Sport, number, number | undefined]> = [
      ['basketball', 8, undefined], ['basketball', 10, undefined],
      ['basketball', 12, undefined], ['basketball', 14, undefined],
      ['basketball', 16, undefined], ['basketball', 18, undefined],
      ['basketball', 18, 16], ['basketball', 18, 14],
      ['volleyball', 20, undefined], ['volleyball', 23, undefined],
    ];
    for (const [sport, age, spanTo] of cases) {
      expect(js.text(sport, age, spanTo), `${sport} U${age} span ${spanTo}`)
        .toBe(line(sport, age, season, spanTo));
    }
  });

  it('agrees on reading the U-number off a name', () => {
    const js = load();
    for (const name of ['DU23-1', 'HU20', 'BB-HU18', 'MU8', 'Legends', 'D1', '']) {
      expect(js.youthAge(name), name).toBe(youthAge(name));
    }
  });
});

describe('the rendered line', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

  it('keeps the data-birth-* contract the browser recompute depends on', () => {
    const astro = read('src/components/BirthYears.astro');
    const js = read('public/js/birth-years.js');
    for (const attr of ['data-birth-sport', 'data-birth-age', 'data-birth-span']) {
      expect(astro, `${attr} missing from BirthYears.astro`).toContain(attr);
      expect(js, `${attr} missing from birth-years.js`).toContain(attr);
    }
    // The script rewrites this node's text and leaves the line alone without it.
    expect(astro).toContain('birth-years-value');
    expect(js).toContain('birth-years-value');
  });

  it('loads the recompute on every page that renders a line', () => {
    for (const page of [
      'src/pages/basketball/teams/nachwuchs.astro',
      'src/pages/volleyball/index.astro',
      'src/pages/volleyball/[slug].astro',
    ]) {
      expect(read(page), page).toContain('/js/birth-years.js');
    }
  });

  it('loads it before team-page.js, which asks it to build the hero line', () => {
    const src = read('src/pages/volleyball/[slug].astro');
    expect(src.indexOf('/js/birth-years.js')).toBeLessThan(src.indexOf('js/team-page.js'));
  });

  it('has a dictionary value for every label it renders', () => {
    const de = JSON.parse(read('public/js/i18n/de.json')) as Record<string, string>;
    const en = JSON.parse(read('public/js/i18n/en.json')) as Record<string, string>;
    for (const key of ['youthBirthYears', 'youthBirthYear', 'youthBirthYearsYounger']) {
      expect(de[key], `${key} missing from de.json`).toBeTruthy();
      expect(en[key], `${key} missing from en.json`).toBeTruthy();
      expect(read('src/components/BirthYears.astro'), key).toContain(key);
    }
  });
});
