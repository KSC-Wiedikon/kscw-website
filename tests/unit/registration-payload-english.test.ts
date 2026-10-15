/**
 * The registration request bodies speak the English API of wiedisync migration
 * 413 (`registrations` columns + value slugs), while the form itself keeps its
 * German option values. The translation lives in buildRegistrationPayload() at
 * the top of public/js/registration-form.js; this file pins its output.
 *
 * The vocabulary is a LITERAL copy of wiedisync
 * directus/extensions/kscw-endpoints/src/registration-values.js (REG_KEY_RENAMES,
 * ROLE_VALUES, OFFICIAL_VALUES, BB_SITUATION_VALUES) — another repo, so the page
 * can only agree with it, not import it. A slug the server does not know is
 * stored as null there, silently; that is what these assertions guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_SRC = readFileSync(resolve(process.cwd(), 'public/js/registration-form.js'), 'utf8');
const DOCS_SRC = readFileSync(resolve(process.cwd(), 'public/js/anmeldung-dokumente.js'), 'utf8');
const PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/pages/weiteres/anmeldung.astro'), 'utf8');

// Old German request keys (REG_KEY_RENAMES' left side) plus the dropped
// nationality fields. None may appear in a body any more.
const GERMAN_KEYS = [
  'anrede', 'vorname', 'nachname', 'telefon_mobil', 'adresse', 'plz', 'ort',
  'geburtsdatum', 'geschlecht', 'ahv_nummer', 'beitragskategorie', 'kantonsschule',
  'rolle', 'bemerkungen', 'lizenz', 'schiedsrichter_stufe', 'sektion_choice',
  'bb_doc_freibrief', 'nationalitaet', 'nationalitaet_code', 'nationalitaet_codes',
];
const ALLOWED_KEYS = new Set([
  'membership_type', 'first_name', 'last_name', 'email', 'phone', 'address',
  'postal_code', 'city', 'birthdate', 'nationality_codes', 'federation_of_origin',
  'sex', 'remarks', 'turnstile_token', 'locale', 'iban', 'salutation', 'role',
  'team', 'fee_category', 'ahv_number', 'cantonal_school', 'officials_requested',
  'referee_level', 'bb_situation', 'bb_recent_licence',
]);
const ROLE_VALUES = ['player', 'coach', 'guest', 'team_responsible', 'other'];
const OFFICIAL_VALUES = ['vb_scorer', 'vb_referee', 'bb_referee', 'otr1', 'otr2', 'otn'];
const BB_SITUATION_VALUES = ['new', 'transfer_ch', 'transfer_intl', 'returning'];

interface RegPayload {
  build(f: Record<string, unknown>): Record<string, unknown>;
  roleSlug(v: string): string | null;
  sexSlug(v: string): string;
  situationSlug(v: string): string;
  recentLicenceBool(v: string): boolean | null;
  officialsList(tokens: string[], type: string): string;
}

/** Run the browser file with no form on the page; it exports, then bails. */
function loadPayload(): RegPayload {
  const sandbox: { KSCW_REG_PAYLOAD?: RegPayload; location: { hostname: string } } = {
    location: { hostname: 'kscw.ch' },
  };
  const doc = {
    getElementById: () => null,
    documentElement: { lang: 'de' },
    addEventListener: () => {},
  };
  new Function('window', 'document', FORM_SRC)(sandbox, doc);
  if (!sandbox.KSCW_REG_PAYLOAD) throw new Error('registration-form.js did not export window.KSCW_REG_PAYLOAD');
  return sandbox.KSCW_REG_PAYLOAD;
}

const reg = loadPayload();

// What the submit handler reads off the DOM — German option values, as the
// <option>/<input> values in anmeldung.astro carry them.
const COMMON = {
  vorname: 'Anna', nachname: 'Muster', email: 'anna@example.ch', phone: '+41 79 123 45 67',
  adresse: 'Musterstrasse 1', plz: '8003', ort: 'Zürich', geburtsdatum: '1995-04-12',
  natCodes: ['IT', 'CH'], federationOfOrigin: '', geschlecht: 'weiblich', bemerkungen: 'Hallo',
  turnstileToken: 'tok', locale: 'de', iban: 'CH9300762011623852957', anrede: 'Frau',
  ahv: '756.1234.5678.97',
};

function assertEnglish(p: Record<string, unknown>) {
  for (const k of Object.keys(p)) {
    expect(GERMAN_KEYS, `German key "${k}" in payload`).not.toContain(k);
    expect(ALLOWED_KEYS.has(k), `unexpected key "${k}"`).toBe(true);
  }
  if ('role' in p) expect(ROLE_VALUES).toContain(p.role);
  if ('officials_requested' in p) {
    for (const s of String(p.officials_requested).split(',')) expect(OFFICIAL_VALUES).toContain(s);
  }
  if ('bb_situation' in p) expect(BB_SITUATION_VALUES).toContain(p.bb_situation);
  expect(['m', 'f']).toContain(p.sex);
  expect(p.nationality_codes).toBe('IT,CH');
}

describe('volleyball registration payload', () => {
  const p = reg.build({
    ...COMMON, membershipType: 'volleyball', funktionVb: 'Spieler*in', teamsVb: ['H1', 'H2'],
    feeVb: 'VB Erwerbstätige', kantonsschuleVb: 'Nein', licencesVb: ['Schreiber', 'Schiedsrichter'],
    refLevelVb: 'Regional',
  });

  it('has only English keys and slug values', () => assertEnglish(p));

  it('maps every field to its 413 column', () => {
    expect(p).toEqual({
      membership_type: 'volleyball',
      first_name: 'Anna', last_name: 'Muster', email: 'anna@example.ch', phone: '+41 79 123 45 67',
      address: 'Musterstrasse 1', postal_code: '8003', city: 'Zürich', birthdate: '1995-04-12',
      nationality_codes: 'IT,CH', federation_of_origin: '', sex: 'f', remarks: 'Hallo',
      turnstile_token: 'tok', locale: 'de', iban: 'CH9300762011623852957',
      salutation: 'Frau', role: 'player', team: 'H1, H2',
      // Still ClubDesk-valued until phase 2b — unchanged.
      fee_category: 'VB Erwerbstätige', cantonal_school: 'Nein',
      ahv_number: '756.1234.5678.97',
      officials_requested: 'vb_scorer,vb_referee', referee_level: 'Regional',
    });
  });
});

describe('basketball registration payload (Swiss-club transfer, no recent licence)', () => {
  const p = reg.build({
    ...COMMON, geschlecht: 'männlich', anrede: 'Herr', membershipType: 'basketball',
    funktionBb: 'Teamverantwortliche*r', teamsBb: ['Herren 1'], feeBb: 'BB Erwerbstätige',
    kantonsschuleBb: 'Nein', bbScorer: 'OTR 1', bbReferee: true,
    bbSituation: 'transfer_ch', bbRecentLicence: 'nein',
  });

  it('has only English keys and slug values', () => assertEnglish(p));

  it('sends the BB vocabulary', () => {
    expect(p.sex).toBe('m');
    expect(p.salutation).toBe('Herr');
    expect(p.role).toBe('team_responsible');
    expect(p.officials_requested).toBe('otr1,bb_referee');
    expect(p.bb_situation).toBe('transfer_ch');
    // A JSON boolean, not 'nein'.
    expect(p.bb_recent_licence).toBe(false);
    expect(JSON.parse(JSON.stringify(p)).bb_recent_licence).toBe(false);
    expect(p.fee_category).toBe('BB Erwerbstätige');
  });

  it('translates the situation radios and recent-licence answer', () => {
    expect(reg.situationSlug('neu')).toBe('new');
    expect(reg.situationSlug('rueckkehr')).toBe('returning');
    expect(reg.situationSlug('transfer_ch')).toBe('transfer_ch');
    expect(reg.situationSlug('transfer_intl')).toBe('transfer_intl');
    expect(reg.recentLicenceBool('ja')).toBe(true);
    expect(reg.recentLicenceBool('nein')).toBe(false);
    expect(reg.recentLicenceBool('')).toBeNull();
  });

  it('sends bb_recent_licence only for a Swiss-club transfer', () => {
    const q = reg.build({ ...COMMON, membershipType: 'basketball', funktionBb: 'Spieler*in', bbSituation: 'neu', bbRecentLicence: 'ja' });
    expect(q.bb_situation).toBe('new');
    expect('bb_recent_licence' in q).toBe(false);
    expect('officials_requested' in q).toBe(false);
  });

  it('maps every Funktion option and BB licence', () => {
    expect(reg.roleSlug('Spieler*in')).toBe('player');
    expect(reg.roleSlug('Trainer*in')).toBe('coach');
    expect(reg.roleSlug('Guest')).toBe('guest');
    expect(reg.roleSlug('Teamverantwortliche*r')).toBe('team_responsible');
    expect(reg.roleSlug('Andere')).toBe('other');
    expect(reg.officialsList(['OTR 2'], 'basketball')).toBe('otr2');
    expect(reg.officialsList(['OTN', 'Schiedsrichter'], 'basketball')).toBe('otn,bb_referee');
  });
});

describe('passive registration payload', () => {
  const p = reg.build({
    ...COMMON, membershipType: 'passive', feePassive: 'Gratis',
    licencesPassive: ['VB Schreiber', 'VB Schiedsrichter', 'BB Schiedsrichter'],
    passiveBbScorer: 'BB OTR 2', refLevelPassive: 'Regional',
  });

  it('has only English keys and slug values', () => assertEnglish(p));

  it('sends officials but no role — a licence list is not a role', () => {
    expect('role' in p).toBe(false);
    expect(p.officials_requested).toBe('vb_scorer,vb_referee,bb_referee,otr2');
    expect(p.fee_category).toBe('Gratis');
    expect(p.referee_level).toBe('Regional');
    expect(p.salutation).toBe('Frau');
    expect('ahv_number' in p).toBe(false);
  });

  it('maps every passive licence option', () => {
    expect(reg.officialsList(['BB OTR 1', 'BB OTN'], 'passive')).toBe('otr1,otn');
  });

  it('falls back to Passivmitglied on a cached page without #passive-fee', () => {
    expect(reg.build({ ...COMMON, membershipType: 'passive' }).fee_category).toBe('Passivmitglied');
  });
});

describe('the other request bodies and the document rules', () => {
  it('check-duplicate posts first_name / last_name', () => {
    expect(FORM_SRC).toContain('JSON.stringify({ first_name: vorname, last_name: nachname, email: email })');
    expect(FORM_SRC).not.toMatch(/JSON\.stringify\(\{\s*vorname:/);
  });

  it('the Freibrief upload is keyed bb_doc_release_letter (collectDocIds / attach route)', () => {
    expect(FORM_SRC).toContain("{ id: 'bb-doc-freibrief-upload', key: 'bb_doc_release_letter' }");
    expect(FORM_SRC).not.toContain("key: 'bb_doc_freibrief'");
  });

  it('the bbDocSet mirror uses the server slugs, a boolean answer and column names', () => {
    expect(FORM_SRC).toContain("var BB_SITUATIONS = ['new', 'transfer_ch', 'transfer_intl', 'returning'];");
    expect(FORM_SRC).toContain("recentLicence !== false && !isYouthFreibriefExempt(dobStr))) required.push('bb_doc_release_letter')");
    expect(FORM_SRC).not.toMatch(/case 'neu'|case 'rueckkehr'|recentLicence !== 'nein'/);
  });

  it('every document key bbDocSet can return has a conditional row on the page', () => {
    for (const k of ['bb_doc_release_letter', 'bb_doc_selfdecl', 'bb_doc_natdecl', 'bb_doc_u18parents']) {
      expect(PAGE_SRC).toContain(`data-doc="${k}"`);
      expect(PAGE_SRC).toContain(`data-doc-upload="${k}"`);
    }
    expect(PAGE_SRC).toContain('data-doc-upload="bb_doc_schoolcert"');
  });

  it('the nachreichen page reads and links bb_doc_release_letter', () => {
    expect(DOCS_SRC).toMatch(/bb_doc_release_letter: de \?/);
    expect(DOCS_SRC).toMatch(/PREFILLABLE = \[[^\]]*'bb_doc_release_letter'/);
    expect(DOCS_SRC).not.toMatch(/'bb_doc_freibrief'|bb_doc_freibrief:/);
  });
});
