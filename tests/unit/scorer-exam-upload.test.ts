import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';

const root = resolve(__dirname, '../..');
const js = readFileSync(resolve(root, 'public/js/scorer-exam-upload.js'), 'utf-8');
const page = readFileSync(resolve(root, 'src/pages/weiteres/schreiberkurse/pruefung.astro'), 'utf-8');
const redirects = readFileSync(resolve(root, 'public/_redirects'), 'utf-8');

const deDict = de as Record<string, string>;
const enDict = en as Record<string, string>;

/**
 * Literal keys the runtime resolves. Every path that ends in a lookup has to be listed
 * here or the test passes by simply not looking: t('x'), setText(el, 'x'), and
 * showError('x') — which is how most of the error copy is reached.
 */
function keysUsedIn(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bsetText\(\s*[A-Za-z0-9_.]+\s*,\s*'([A-Za-z0-9_]+)'/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bshowError\(\s*'([A-Za-z0-9_]+)'/g)) found.add(m[1]);
  return [...found];
}

describe('scorer exam upload — i18n wiring', () => {
  // The dictionaries are checked against each other elsewhere; what that cannot catch is
  // a key the CODE asks for that no dictionary has. i18n.t() returns the key itself on a
  // miss, so the symptom is a user seeing "scorerExamNotRegistered" — a silent failure
  // no build step would flag.
  it('every key the upload script asks for exists in both dictionaries', () => {
    const used = keysUsedIn(js);
    expect(used.length).toBeGreaterThan(8); // guard against the regex silently matching nothing
    expect(used.filter((k) => !(k in deDict))).toEqual([]);
    expect(used.filter((k) => !(k in enDict))).toEqual([]);
  });

  it('every data-i18n key on the page exists in both dictionaries', () => {
    const used = [...page.matchAll(/data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((k) => !(k in deDict))).toEqual([]);
    expect(used.filter((k) => !(k in enDict))).toEqual([]);
  });

  // The code calls t('scorerExamAlreadyUploaded', { date }); the engine substitutes by
  // literal '{date}'. A translation that drops the placeholder silently loses the date.
  it('the interpolated string keeps its {date} placeholder in both languages', () => {
    expect(deDict.scorerExamAlreadyUploaded).toContain('{date}');
    expect(enDict.scorerExamAlreadyUploaded).toContain('{date}');
  });
});

describe('scorer exam upload — transport contract', () => {
  // Regression guard for a bug that passes every curl test and fails in every browser:
  // this Directus answers preflight with
  //   access-control-allow-headers: Content-Type, Authorization, X-Turnstile-Token
  // so ticket/filename must travel in the query string. Moving them into custom headers
  // would break uploads in browsers only.
  it('sends the ticket and filename as query params, not custom headers', () => {
    expect(js).toContain('?ticket=');
    expect(js).toContain('&filename=');
    expect(js).not.toMatch(/headers:\s*\{[^}]*x-exam/i);
  });

  it('url-encodes the ticket (it is base64url + a dot separator)', () => {
    expect(js).toMatch(/encodeURIComponent\(m\.ticket\)/);
  });

  it('sends the SVRZ licence with the upload', () => {
    expect(js).toContain('&licence=');
    expect(js).toMatch(/encodeURIComponent\(licence\)/);
  });

  it('posts the raw file as octet-stream so Directus does not body-parse it', () => {
    expect(js).toContain("'Content-Type': 'application/octet-stream'");
  });

  it('points at prod Directus, with dev reserved for localhost', () => {
    expect(js).toContain('https://directus.kscw.ch');
    expect(js).toContain('https://directus-dev.kscw.ch');
    expect(js).toMatch(/localhost/);
  });

  // Mirrors UPLOAD_MAX_BYTES in wiedisync's scorer-exam.js. A client cap larger than the
  // server's turns a clear message into a mid-upload 413.
  it('caps uploads at the same 10 MB the server enforces', () => {
    expect(js).toContain('10 * 1024 * 1024');
  });
});

describe('scorer exam upload — SVRZ licence', () => {
  // The client and server must agree on what a licence is, or the page accepts a value
  // the server then rejects with a 422 the user cannot act on.
  it('normalizes licences exactly as normalizeLicence() does server-side', () => {
    const src = /function normalizeLicence\(v\) \{[\s\S]*?\n  \}/.exec(js)?.[0] ?? '';
    expect(src).toBeTruthy();
    // eslint-disable-next-line no-new-func
    const normalize = new Function(`${src}; return normalizeLicence;`)() as (v: unknown) => string;

    expect(normalize('337646')).toBe('337646');
    expect(normalize(' 337 646 ')).toBe('337646');
    expect(normalize('337-646')).toBe('337646');
    expect(normalize('Nr. 337646')).toBe('337646');
    expect(normalize('')).toBe('');
    expect(normalize('abcdef')).toBe('');
    expect(normalize('123')).toBe('');           // too short
    expect(normalize('12345678901')).toBe('');   // too long
  });

  it('asks for the licence on the page, pre-fillable and required', () => {
    expect(page).toContain('id="exam-licence"');
    expect(page).toContain('data-i18n="scorerExamLicenceLabel"');
  });

  it('distinguishes a missing licence from an invalid one', () => {
    expect(js).toContain('scorerExamLicenceMissing');
    expect(js).toContain('scorerExamLicenceInvalid');
  });

  it('surfaces the server 422 rather than a generic network error', () => {
    expect(js).toMatch(/status === 422/);
  });
});

describe('scorer exam upload — page', () => {
  it('loads Turnstile and the upload runtime', () => {
    expect(page).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(page).toContain('/js/scorer-exam-upload.js');
  });

  it('accepts only the formats the server will sniff-approve', () => {
    const accept = /accept="([^"]+)"/.exec(page)?.[1] ?? '';
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/heic']) {
      expect(accept).toContain(type);
    }
  });

  it('keeps the announced umlaut URL working via a 301 to the ASCII slug', () => {
    expect(redirects).toContain('/weiteres/schreiberkurse/pr%C3%BCfung');
    expect(redirects).toMatch(/schreiberkurse\/pr%C3%BCfung\s+\/weiteres\/schreiberkurse\/pruefung\s+301/);
  });

  // The umlaut rules must precede the catch-all /de/* and /en/* rules: Cloudflare Pages
  // is first-match-wins.
  it('orders the umlaut redirect before the locale catch-alls', () => {
    expect(redirects.indexOf('pr%C3%BCfung')).toBeLessThan(redirects.indexOf('/de/*'));
  });
});
