/**
 * The fee table on the signup form vs. the invoice engine.
 *
 * `public/js/registration-fees.js` is a hand copy of feeBreakdown() in
 * wiedisync/directus/extensions/kscw-endpoints/src/clubdesk-update.js (bases
 * from CD_BEITRAG_MAP, surcharge sets, isU16Plus, the guest rule) plus the
 * licence split of migration 323-dues-rate-licence-split.sql. The engine lives
 * in another repo and needs a member row, so the page cannot call it — it can
 * only agree with it. Every figure below is a LITERAL taken from the engine, not
 * recomputed: a copy that agrees with itself proves nothing. When the club
 * changes a fee, both the engine and the page change, and so does this file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Tier = 'intro' | 'youth' | 'adult' | 'none';
type Sport = 'volleyball' | 'basketball' | 'passive';
interface Category { sport: Sport; base: number; licence?: number; licenceByAge?: true; tier: Tier }
type BbBand = 'U12' | 'U14' | 'U16' | 'U18' | 'U20' | 'senior';
interface Breakdown {
  category: string; base: number; licence: number; clubFee: number;
  surcharge: number; guestDiscount: number; total: number;
  coachWaiver: boolean; refereeNote: boolean;
}
interface Fees {
  NO_LICENCE_SURCHARGE: number;
  GUEST_DISCOUNT: number;
  CATEGORIES: Record<string, Category>;
  BB_LICENCE: Record<BbBand, number>;
  categoriesFor(sport: Sport, funktion: string): string[];
  isU16Plus(dobIso: string, refYear?: number): boolean | null;
  seasonStartYear(now?: Date): number;
  bbAgeBand(dobIso: string, seasonYear?: number): BbBand | null;
  bbLicence(dobIso: string, seasonYear?: number): number | null;
  breakdown(opts: {
    category: string; funktion?: string; dob?: string;
    scorer?: boolean; referee?: boolean; refYear?: number; seasonYear?: number;
  }): Breakdown | null;
}

/** Load the ES5 file the way a browser would, and hand back window.KSCW_FEES. */
function loadFees(): Fees {
  const src = readFileSync(resolve(process.cwd(), 'public/js/registration-fees.js'), 'utf8');
  const sandbox: { KSCW_FEES?: Fees } = {};
  new Function('window', src)(sandbox);
  if (!sandbox.KSCW_FEES) throw new Error('public/js/registration-fees.js did not export window.KSCW_FEES');
  return sandbox.KSCW_FEES;
}

const fees = loadFees();
const REF_YEAR = 2026;
// Season 2026/27 — the sheet the BB licence bands are copied from.
const SEASON = 2026;

describe('constants mirror the engine', () => {
  it('NO_LICENCE_SURCHARGE 100, GUEST_DISCOUNT 110', () => {
    expect(fees.NO_LICENCE_SURCHARGE).toBe(100);
    expect(fees.GUEST_DISCOUNT).toBe(110);
  });
});

describe('CATEGORIES', () => {
  // clubdesk-update.js CD_BEITRAG_MAP (base) — BB amounts are the post-2026-08-10
  // ones — and migration 323 licence_chf (licence: RLL 110, JLL 60). Basketball
  // has no per-category licence there (seeded 0 — Swiss Basketball prices by
  // age band, see BB_LICENCE below), so those rows carry 'age' instead.
  const ENGINE: Array<[string, Sport, number, number | 'age', Tier]> = [
    ['VB Turnier KWI',                  'volleyball', 110, 60,    'intro'],
    ['VB Schüler*in Turnier',           'volleyball', 210, 60,    'youth'],
    ['VB Schüler*in Meisterschaft',     'volleyball', 310, 60,    'youth'],
    ['VB Student*in Meisterschaft',     'volleyball', 380, 110,   'adult'],
    ['VB Erwerbstätige',                'volleyball', 440, 110,   'adult'],
    ['BB Erwerbstätige 1. Liga',        'basketball', 570, 'age', 'adult'],
    ['BB Lernende/Studierende 1. Liga', 'basketball', 470, 'age', 'adult'],
    ['BB Erwerbstätige',                'basketball', 520, 'age', 'adult'],
    ['BB Lernende/Studierende',         'basketball', 420, 'age', 'adult'],
    ['BB Jugend Meisterschaft',         'basketball', 320, 'age', 'youth'],
    ['BB Minis Turnier',                'basketball', 220, 'age', 'youth'],
    ['Passivmitglied',                  'passive',    40,  0,     'none'],
    ['Gratis',                          'passive',    0,   0,     'none'],
  ];

  it.each(ENGINE)('%s → %s, base %i, licence %s, tier %s', (name, sport, base, licence, tier) => {
    expect(fees.CATEGORIES[name]).toEqual(
      licence === 'age' ? { sport, base, licenceByAge: true, tier } : { sport, base, licence, tier },
    );
  });

  it('holds exactly the engine categories, in select order', () => {
    expect(Object.keys(fees.CATEGORIES)).toEqual(ENGINE.map(([name]) => name));
  });

  it('never carves a licence larger than the fee (migration 323 CHECK)', () => {
    for (const c of Object.values(fees.CATEGORIES)) {
      if (c.licenceByAge) continue;
      expect(c.licence).toBeGreaterThanOrEqual(0);
      expect(c.licence!).toBeLessThanOrEqual(c.base);
    }
  });
});

describe('Swiss Basketball licence by age band', () => {
  // "Lizenzen und Eintrittsfinanzen 2026-27" (swiss.basketball resource center,
  // Lizenzen → Preise & Beiträge, PDF of 2026-07-22), « Spieler » Lizenz,
  // regional — literal figures, not recomputed.
  it('BB_LICENCE is the 2026/27 sheet', () => {
    expect(fees.BB_LICENCE).toEqual({ senior: 150, U20: 115, U18: 90, U16: 80, U14: 55, U12: 40 });
  });

  // 1 July, not 1 August: the same cut-over as the season label and the minor
  // check in registration-form.js, so a July applicant is priced on the band of
  // the season the form says they are registering for (audit 2026-09-28, F-56).
  it('seasons start on 1 July (UTC), named by the first calendar year', () => {
    expect(fees.seasonStartYear(new Date('2026-06-30T23:59:59Z'))).toBe(2025);
    expect(fees.seasonStartYear(new Date('2026-07-01T00:00:00Z'))).toBe(2026);
    expect(fees.seasonStartYear(new Date('2026-07-31T23:59:59Z'))).toBe(2026);
    expect(fees.seasonStartYear(new Date('2027-03-01T12:00:00Z'))).toBe(2026);
  });

  it('agrees with the season registration-form.js prints on the licence PDF', () => {
    // currentSeasonLabel() there: (getMonth() + 1) >= 7 → July. Read from source so
    // the two cannot drift apart silently again.
    const form = readFileSync(resolve(process.cwd(), 'public/js/registration-form.js'), 'utf8');
    expect(form).toMatch(/function currentSeasonLabel\(\)[\s\S]{0,200}\(now\.getMonth\(\) \+ 1\) >= 7/);
  });

  // Bands per src/lib/birthYears.ts for 2026/27: U12 = 2015–2016, U14 = 2013–2014,
  // U16 = 2011–2012, U18 = 2009–2010, U20 = 2007–2008, senior from 2006.
  it.each<[string, BbBand, number]>([
    ['2017-05-05', 'U12', 40],   // U10 — shares the U12 price
    ['2016-12-31', 'U12', 40],
    ['2015-01-01', 'U12', 40],
    ['2014-12-31', 'U14', 55],
    ['2013-01-01', 'U14', 55],
    ['2012-12-31', 'U16', 80],
    ['2011-01-01', 'U16', 80],
    ['2010-12-31', 'U18', 90],
    ['2009-01-01', 'U18', 90],
    ['2008-12-31', 'U20', 115],
    ['2007-01-01', 'U20', 115],
    ['2006-12-31', 'senior', 150],
    ['1990-01-01', 'senior', 150],
  ])('born %s in 2026/27 → %s, CHF %i', (dob, band, chf) => {
    expect(fees.bbAgeBand(dob, SEASON)).toBe(band);
    expect(fees.bbLicence(dob, SEASON)).toBe(chf);
  });

  it('the band moves with the season, not the calendar year', () => {
    expect(fees.bbAgeBand('2015-01-01', 2027)).toBe('U14');
  });

  it('unknown birthdate → null, never a guessed band', () => {
    expect(fees.bbAgeBand('', SEASON)).toBeNull();
    expect(fees.bbAgeBand('garbage', SEASON)).toBeNull();
    expect(fees.bbLicence('', SEASON)).toBeNull();
  });
});

describe('isU16Plus', () => {
  it('born <= refYear − 15 is U16+', () => {
    expect(fees.isU16Plus('2011-09-30', REF_YEAR)).toBe(true);
    expect(fees.isU16Plus('2011-01-01', REF_YEAR)).toBe(true);
  });
  it('born after that is not', () => {
    expect(fees.isU16Plus('2012-01-01', REF_YEAR)).toBe(false);
  });
  it('unknown or unparsable is null, not false', () => {
    expect(fees.isU16Plus('', REF_YEAR)).toBeNull();
    expect(fees.isU16Plus('garbage', REF_YEAR)).toBeNull();
  });
});

describe('VB Erwerbstätige (adult tier)', () => {
  it('no scorer licence → 330 + 110 licence + 100 surcharge = 540', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Spieler*in', dob: '1990-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b).toEqual({
      category: 'VB Erwerbstätige', base: 440, licence: 110, clubFee: 330,
      surcharge: 100, guestDiscount: 0, total: 540, coachWaiver: false, refereeNote: false,
    });
  });
  it('scorer licence → 440', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Spieler*in', dob: '1990-01-01', scorer: true, referee: false, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(440);
  });
  it('referee → 440 and the referee note', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Spieler*in', dob: '1990-01-01', scorer: false, referee: true, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(440);
    expect(b?.refereeNote).toBe(true);
    expect(b?.coachWaiver).toBe(false);
  });
  it('adult tier is surcharged without a birthdate', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Spieler*in', dob: '', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(100);
  });
});

describe('VB Turnier KWI (intro tier)', () => {
  it('is never surcharged, even for an adult without a licence', () => {
    const b = fees.breakdown({ category: 'VB Turnier KWI', funktion: 'Spieler*in', dob: '1990-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(110);
    expect(b?.licence).toBe(60);
    expect(b?.clubFee).toBe(50);
  });
});

describe('VB Schüler*in Meisterschaft (youth tier)', () => {
  const base = { category: 'VB Schüler*in Meisterschaft', funktion: 'Spieler*in', scorer: false, referee: false, refYear: REF_YEAR };
  // Engine: born <= refYear − 15 (2026 → 2011) is U16+. 2012 is one year short.
  it('U16+ by birth year → surcharge', () => {
    const b = fees.breakdown({ ...base, dob: '2011-05-01' });
    expect(b?.surcharge).toBe(100);
    expect(b?.total).toBe(410);
  });
  it('younger → no surcharge', () => {
    expect(fees.breakdown({ ...base, dob: '2012-01-01' })?.surcharge).toBe(0);
    const b = fees.breakdown({ ...base, dob: '2013-01-01' });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(310);
  });
  it('unknown birthdate → no surcharge (null is not U16+)', () => {
    const b = fees.breakdown({ ...base, dob: '' });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(310);
  });
});

describe('guest', () => {
  it('VB Erwerbstätige → −110, never surcharged, no licence line', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Guest', dob: '1990-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.guestDiscount).toBe(110);
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(330);
    // finance.js zeroes a guest's licence portion — the reduction IS the licence
    // coming off — so the invoice reads 440 / −110 / 330 with no licence line.
    expect(b?.clubFee).toBe(440);
    expect(b?.licence).toBe(0);
  });
  it('a guest\'s referee tick does not raise the note — the engine has no guest referee rule', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Guest', dob: '1990-01-01', scorer: false, referee: true, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(330);
  });
  it('VB Schüler*in Turnier → 100', () => {
    const b = fees.breakdown({ category: 'VB Schüler*in Turnier', funktion: 'Guest', dob: '2010-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(100);
  });
  it('never goes below 0 — the reduction is capped at the base', () => {
    const b = fees.breakdown({ category: 'Passivmitglied', funktion: 'Guest', dob: '', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.guestDiscount).toBe(40);
    expect(b?.total).toBe(0);
    const g = fees.breakdown({ category: 'Gratis', funktion: 'Guest', dob: '', scorer: false, referee: false, refYear: REF_YEAR });
    expect(g?.guestDiscount).toBe(0);
    expect(g?.total).toBe(0);
  });
});

describe('coach', () => {
  it('may only pick Gratis', () => {
    expect(fees.categoriesFor('volleyball', 'Trainer*in')).toEqual(['Gratis']);
    expect(fees.categoriesFor('basketball', 'Trainer*in')).toEqual(['Gratis']);
  });
  it('Gratis → 0 with the coach note', () => {
    const b = fees.breakdown({ category: 'Gratis', funktion: 'Trainer*in', dob: '1990-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.total).toBe(0);
    expect(b?.surcharge).toBe(0);
    expect(b?.coachWaiver).toBe(true);
    expect(b?.category).toBe('Gratis');
  });
  it('is computed as Gratis even if the select still says something else', () => {
    const b = fees.breakdown({ category: 'VB Erwerbstätige', funktion: 'Trainer*in', dob: '1990-01-01', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.category).toBe('Gratis');
    expect(b?.total).toBe(0);
    expect(b?.coachWaiver).toBe(true);
  });
});

describe('categoriesFor', () => {
  const VB = ['VB Turnier KWI', 'VB Schüler*in Turnier', 'VB Schüler*in Meisterschaft', 'VB Student*in Meisterschaft', 'VB Erwerbstätige'];
  const BB = ['BB Erwerbstätige 1. Liga', 'BB Lernende/Studierende 1. Liga', 'BB Erwerbstätige', 'BB Lernende/Studierende', 'BB Jugend Meisterschaft', 'BB Minis Turnier'];

  it('guest: volleyball without the KWI intro tier, order kept', () => {
    expect(fees.categoriesFor('volleyball', 'Guest')).toEqual(VB.slice(1));
  });
  it('guest: all six basketball categories (no intro tier)', () => {
    expect(fees.categoriesFor('basketball', 'Guest')).toEqual(BB);
  });
  it('player: the whole sport in select order', () => {
    expect(fees.categoriesFor('volleyball', 'Spieler*in')).toEqual(VB);
    expect(fees.categoriesFor('basketball', 'Spieler*in')).toEqual(BB);
  });
  it('team lead, other and unset see the whole sport too', () => {
    for (const f of ['Teamverantwortliche*r', 'Andere', '']) {
      expect(fees.categoriesFor('volleyball', f)).toEqual(VB);
      expect(fees.categoriesFor('basketball', f)).toEqual(BB);
    }
  });
  it('passive: Passivmitglied and Gratis', () => {
    expect(fees.categoriesFor('passive', '')).toEqual(['Passivmitglied', 'Gratis']);
  });
});

describe('basketball', () => {
  const bb = (o: { category: string; funktion?: string; dob: string; scorer?: boolean; referee?: boolean }) =>
    fees.breakdown({ funktion: 'Spieler*in', scorer: false, referee: false, ...o, refYear: REF_YEAR, seasonYear: SEASON });

  it('BB Erwerbstätige, adult, no table-official licence → 370 + 150 + 100 = 620', () => {
    const b = bb({ category: 'BB Erwerbstätige', dob: '1990-01-01' });
    expect(b?.licence).toBe(150);
    expect(b?.clubFee).toBe(370);
    expect(b?.surcharge).toBe(100);
    expect(b?.total).toBe(620);
  });
  it('BB Erwerbstätige with a table-official licence → 520; the licence split stays', () => {
    const b = bb({ category: 'BB Erwerbstätige', dob: '1990-01-01', scorer: true });
    expect(b?.total).toBe(520);
    expect(b?.licence).toBe(150);
  });
  it('the licence follows the AGE, not the category: a U18 in an adult category → 90', () => {
    const b = bb({ category: 'BB Lernende/Studierende', dob: '2009-06-01' });
    expect(b?.licence).toBe(90);
    expect(b?.clubFee).toBe(330);
    // Adult category → surcharged regardless of birthdate (SURCHARGE_ADULT).
    expect(b?.surcharge).toBe(100);
    expect(b?.total).toBe(520);
  });
  it('BB Jugend Meisterschaft, U16 (born 2011) → 240 + 80, surcharged (U16+ by calendar year)', () => {
    const b = bb({ category: 'BB Jugend Meisterschaft', dob: '2011-03-01' });
    expect(b?.licence).toBe(80);
    expect(b?.clubFee).toBe(240);
    expect(b?.surcharge).toBe(100);
    expect(b?.total).toBe(420);
  });
  it('BB Jugend Meisterschaft, U14 (born 2013) → 265 + 55, no surcharge', () => {
    const b = bb({ category: 'BB Jugend Meisterschaft', dob: '2013-03-01' });
    expect(b?.licence).toBe(55);
    expect(b?.clubFee).toBe(265);
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(320);
  });
  it('BB Minis Turnier, born 2016 → 180 + 40 = 220', () => {
    const b = bb({ category: 'BB Minis Turnier', dob: '2016-03-15' });
    expect(b?.licence).toBe(40);
    expect(b?.clubFee).toBe(180);
    expect(b?.surcharge).toBe(0);
    expect(b?.total).toBe(220);
  });
  it('no birthdate → no licence line (0), the whole base on line 1, total unchanged', () => {
    const b = bb({ category: 'BB Erwerbstätige', dob: '' });
    expect(b?.licence).toBe(0);
    expect(b?.clubFee).toBe(520);
    expect(b?.total).toBe(620);
  });
  it('a guest never gets a licence line, whatever the age', () => {
    const b = bb({ category: 'BB Erwerbstätige', funktion: 'Guest', dob: '1990-01-01' });
    expect(b?.licence).toBe(0);
    expect(b?.guestDiscount).toBe(110);
    expect(b?.total).toBe(410);
  });
});

describe('passive and unknown', () => {
  it('Passivmitglied → 40', () => {
    const b = fees.breakdown({ category: 'Passivmitglied', funktion: '', dob: '', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.total).toBe(40);
    expect(b?.surcharge).toBe(0);
    expect(b?.licence).toBe(0);
  });
  it('Gratis → 0', () => {
    const b = fees.breakdown({ category: 'Gratis', funktion: '', dob: '', scorer: false, referee: false, refYear: REF_YEAR });
    expect(b?.total).toBe(0);
    expect(b?.coachWaiver).toBe(false);
  });
  it('unknown category → null, never a guessed amount', () => {
    expect(fees.breakdown({ category: 'VB Superliga', refYear: REF_YEAR })).toBeNull();
    expect(fees.breakdown({ category: '', refYear: REF_YEAR })).toBeNull();
  });
});
