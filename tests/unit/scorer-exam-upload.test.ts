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
    expect(js).toMatch(/encodeURIComponent\(ticket\)/);
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

// wiedisync scorer-exam.js (2026-09-28 audit, F-14): /upload answers 409 already_graded
// once an admin has recorded a verdict, and /ticket may report `graded` up front. The
// licence rule is 205df80's `licence_on_file` flow, tested above.
describe('scorer exam upload — graded exams', () => {
  it('has a DE and EN message for an already graded exam, and uses it', () => {
    expect(deDict.scorerExamAlreadyGraded).toBeTruthy();
    expect(enDict.scorerExamAlreadyGraded).toBeTruthy();
    expect(js).toContain("showError('scorerExamAlreadyGraded')");
  });

  it('maps a 409 already_graded to that message, not a generic error', () => {
    const i = js.indexOf("r.status === 409 && r.body.error === 'already_graded'");
    expect(i).toBeGreaterThan(-1);
    expect(js.indexOf("showError('scorerExamAlreadyGraded')", i)).toBeGreaterThan(i);
  });

  it('shows the graded notice up front and keeps the upload button disabled', () => {
    expect(js).toContain("setText(already, 'scorerExamAlreadyGraded')");
    expect(js).toContain('fileSubmit.disabled = !!(info && info.graded);');
  });
});

describe('scorer exam upload — page', () => {
  it('loads Turnstile and the upload runtime', () => {
    expect(page).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(page).toContain('/js/scorer-exam-upload.js');
  });

  it('accepts only the formats the server will sniff-approve', () => {
    const accept = /accept="([^"]+)"/.exec(page)?.[1] ?? '';
    for (const type of ['application/pdf', 'image/jpeg', 'image/png']) {
      expect(accept).toContain(type);
    }
  });

  // The picker must not offer what the server rejects (sniffType dropped HEIC: nothing
  // downstream can decode it). Offering it would invite an upload that only fails at
  // the end — and on iOS, leaving HEIC out of `accept` is also what nudges Safari into
  // transcoding the photo to JPEG on the way out.
  it('does not offer HEIC, which the server refuses', () => {
    const accept = /accept="([^"]+)"/.exec(page)?.[1] ?? '';
    expect(accept).not.toContain('heic');
    expect(accept).not.toContain('heif');
  });

  it('keeps the announced umlaut URL working via a 301 to the ASCII slug', () => {
    expect(redirects).toContain('/weiteres/schreiberkurse/pr%C3%BCfung');
    expect(redirects).toMatch(/schreiberkurse\/pr%C3%BCfung\s+\/weiteres\/schreiberkurse\/pruefung\s+301/);
  });

  // There used to be /de/* and /en/* catch-alls in _redirects that the umlaut rules had
  // to precede (first-match-wins). Those moved to functions/_middleware.js (F-40), so
  // what matters now is that no locale rule creeps back in: it would shadow nothing
  // useful, never fire (the Function owns /de and /en), and reopen the open redirect.
  // Comments are stripped first — the file explains the move in prose.
  it('has no /de or /en rule left for the umlaut redirect to race', () => {
    const rules = redirects.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const source = rule.split(/\s+/)[0];
      expect(source, rule).not.toMatch(/^\/(de|en)(\/|$)/);
    }
  });
});

// 2026-09-28 audit: /lookup MAILS the ticket; it must never come back to the browser, and
// the page must not reveal whether an address is registered.
describe('scorer exam upload — emailed ticket link', () => {
  it('reads the ticket from the URL fragment and strips it from the address bar', () => {
    expect(js).toMatch(/location\.hash/);
    expect(js).toMatch(/get\('ticket'\)/);
    expect(js).toMatch(/history\.replaceState/);
    // Stripped BEFORE the network call, so a failed /ticket request cannot leave it visible.
    expect(js.indexOf('stripTicketFromUrl();')).toBeLessThan(js.indexOf('openTicket(initialTicket)'));
  });

  it('asks /ticket for display data with the ticket in the body, not the URL', () => {
    expect(js).toContain("/kscw/scorer-exam/ticket'");
    expect(js).toMatch(/JSON\.stringify\(\{ ticket: tk \}\)/);
  });

  it('never takes a ticket, name or licence from the /lookup answer', () => {
    const lookup = js.slice(js.indexOf("/kscw/scorer-exam/lookup'"), js.indexOf('otherAddressBtn.addEventListener'));
    expect(lookup).not.toMatch(/r\.body\.data/);
    expect(lookup).not.toMatch(/status === 404/);
    expect(lookup).toMatch(/r\.body\.ok/);
  });

  it('uses licence_on_file instead of pre-filling a licence number', () => {
    expect(js).toContain('licence_on_file');
    expect(js).not.toMatch(/licenceInput\.value\s*=\s*\(?\s*m/);
    expect(page).toContain('id="exam-licence-group"');
    expect(page).toContain('data-i18n="scorerExamLicenceOnFile"');
  });

  it('shows the neutral "check your inbox" step', () => {
    expect(page).toContain('id="exam-step-sent"');
    expect(deDict.scorerExamLinkSentHint).toMatch(/^Falls/);
    expect(enDict.scorerExamLinkSentHint).toMatch(/^If this address/);
  });
});
