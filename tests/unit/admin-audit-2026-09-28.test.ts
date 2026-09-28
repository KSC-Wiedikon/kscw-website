import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Pins the /admin fixes from the 2026-09-28 security/logic audit (F-07, F-10, F-11,
// F-18 … F-28, F-53, F-63 … F-65). Where a fix is a pure helper it is loaded out of
// the shipped source and run; where it is wiring (which route, which guard) the
// source itself is asserted, because that is what regresses silently.
const SRC = readFileSync('src/pages/admin.astro', 'utf8');

function snippet(startMarker: string): string {
  const start = SRC.indexOf(startMarker);
  expect(start, `${startMarker} not found in admin.astro`).toBeGreaterThan(-1);
  // Single-line declarations (var X = …;) end at their own line.
  if (startMarker.startsWith('var ')) return SRC.slice(start, SRC.indexOf('\n', start));
  const end = SRC.indexOf('\n    }', start);
  expect(end, `end of ${startMarker} not found`).toBeGreaterThan(-1);
  return SRC.slice(start, end + '\n    }'.length);
}

function load<T>(markers: string[], ret: string, prelude = ''): T {
  return new Function(`${prelude}\n${markers.map(snippet).join('\n')}\nreturn ${ret};`)() as T;
}

const ZURICH = [
  'function zurichParts(d)',
  'function isoToZurichInput(iso)',
  'function zurichInputToISO(v)',
  'function zurichToday()',
];

afterEach(() => { vi.useRealTimers(); });

describe('F-53 — today on the Zurich clock', () => {
  const zurichToday = load<() => string>(ZURICH, 'zurichToday');

  it('is already tomorrow here while UTC is still on the previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T23:30:00Z')); // 01:30 CEST on the 28th
    expect(zurichToday()).toBe('2026-09-28');
  });

  it('no UTC-sliced "today" is left in the page', () => {
    expect(SRC).not.toMatch(/new Date\(\)\.toISOString\(\)\.substring\(0, 10\)/);
  });
});

describe('F-07 — unpublished news is not public', () => {
  type Pub = { is_published: boolean; published_at: string | null };
  const newsPublication = load<(p: boolean, d: string | null, prev: string | null) => Pub>(
    [...ZURICH, 'function newsPublication('], 'newsPublication');

  it('archiving clears published_at (the Public read filters on it, not is_published)', () => {
    expect(newsPublication(false, null, '2026-03-01T00:00:00Z')).toEqual({ is_published: false, published_at: null });
  });

  it('a draft saved with the toggle off does not keep its date', () => {
    expect(newsPublication(false, '2026-09-28', null).published_at).toBeNull();
  });

  it('publishing keeps the typed date, else the stored one, else today', () => {
    expect(newsPublication(true, '2026-10-05', '2026-01-01')).toEqual({ is_published: true, published_at: '2026-10-05' });
    expect(newsPublication(true, '', '2026-01-01').published_at).toBe('2026-01-01');
    expect(newsPublication(true, '', null).published_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('both the archive button and the form save go through it', () => {
    expect(SRC).toContain('JSON.stringify(newsPublication(!willArchive, null, item.published_at))');
    expect(SRC).toMatch(/Object\.assign\(payload, newsPublication\(/);
    expect(SRC).not.toContain('payload.is_published =');
  });
});

describe('F-11 — scorer-course time', () => {
  const norm = load<(v: unknown) => string | null>(['function normalizeCourseTime('], 'normalizeCourseTime');

  it.each([
    ['18:00', '18:00'], ['18.00', '18:00'], ['9.30', '09:30'], ['18h', '18:00'],
    ['18 Uhr', '18:00'], ['18h30', '18:30'], [' 07:05 ', '07:05'], ['', ''], [null, ''],
  ])('%j -> %j', (input, out) => { expect(norm(input)).toBe(out); });

  it.each(['24:00', '18:60', 'abends', '18:0', '1830', '18:00-22:00'])('refuses %j', (input) => {
    expect(norm(input)).toBeNull();
  });

  it('the save refuses an unreadable time instead of storing it', () => {
    expect(SRC).toContain("if (scTime === null) throw new Error(t('scTimeInvalid'));");
  });
});

describe('F-19 — spreadsheet formulas in exports', () => {
  const tsvEscape = load<(v: unknown) => string>(['function formulaSafe(', 'function tsvEscape('], 'tsvEscape');
  const csvSafe = load<(v: unknown) => string>(['function csvSafe('], 'csvSafe');

  it.each(['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)'])('neutralises %j in TSV', (v) => {
    expect(tsvEscape(v).startsWith("'")).toBe(true);
  });

  it('a leading tab is collapsed first and still cannot start a formula', () => {
    expect(tsvEscape('\t=1+1')).toBe("'=1+1");
  });

  it('leaves ordinary text alone, and CSV keeps its own rule', () => {
    expect(tsvEscape('Anna Muster')).toBe('Anna Muster');
    expect(csvSafe('=1')).toBe('"\'=1"');
  });
});

describe('F-20 — mailto from form-entered addresses', () => {
  const api = load<{ isPlainEmail: (e: string) => boolean; mailtoHref: (e: string[]) => string }>(
    ['var PLAIN_EMAIL_RE', 'function isPlainEmail(', 'function mailtoHref('],
    '{ isPlainEmail: isPlainEmail, mailtoHref: mailtoHref }');

  it.each(['a@b.ch?bcc=spy@x.ch', 'a@b.ch&cc=x@y.ch', 'a b@c.ch', 'a@b', 'a@b.ch,c@d.ch', '<a@b.ch>', 'a%40b@c.ch'])(
    'rejects %j', (e) => { expect(api.isPlainEmail(e)).toBe(false); });

  it.each(['anna.muster@kscw.ch', "o'neil+club@sub.example.co.uk"])('accepts %j', (e) => {
    expect(api.isPlainEmail(e)).toBe(true);
  });

  it('percent-encodes each part and drops anything that is not a plain address', () => {
    expect(api.mailtoHref(["o'neil+x@a.ch", 'a@b.ch?bcc=spy@x.ch', 'c@d.ch']))
      .toBe("mailto:o'neil%2Bx@a.ch,c@d.ch");
  });

  it('the participant mail button uses it', () => {
    expect(SRC).toContain('window.location.href = mailtoHref(emails);');
    expect(SRC).not.toMatch(/'mailto:' \+ emails\.join/);
  });
});

describe('F-23 — editing an event keeps what it holds', () => {
  const api = load<{
    eventTypeOptions: (c: string | null) => string[];
    eventDateInputs: (i: unknown) => Record<string, string>;
    eventDatePayload: (a: boolean, sd: string, st: string, ed: string, et: string) => Record<string, unknown>;
  }>(
    [...ZURICH, 'var EVENT_TYPES', 'function eventTypeOptions(', 'function eventDateInputs(', 'function eventDatePayload('],
    '{ eventTypeOptions: eventTypeOptions, eventDateInputs: eventDateInputs, eventDatePayload: eventDatePayload }');

  it('offers every type, and never drops an unknown stored one', () => {
    const opts = api.eventTypeOptions(null);
    for (const v of ['verein', 'social', 'meeting', 'tournament', 'trainingsweekend', 'friendly', 'other']) {
      expect(opts).toContain(v);
    }
    expect(api.eventTypeOptions('camp')).toContain('camp');
  });

  it('a timed event round-trips on the Zurich clock', () => {
    const item = { all_day: false, start_date: '2026-07-10T16:30:00.000Z', end_date: '2026-07-10T20:00:00.000Z' };
    const inp = api.eventDateInputs(item);
    expect(inp).toEqual({ startDate: '2026-07-10', startTime: '18:30', endDate: '2026-07-10', endTime: '22:00' });
    expect(api.eventDatePayload(false, inp.startDate, inp.startTime, inp.endDate, inp.endTime)).toEqual({
      all_day: false, start_date: item.start_date, end_date: item.end_date,
    });
  });

  it('an all-day event stays a bare date', () => {
    const inp = api.eventDateInputs({ all_day: true, start_date: '2026-11-01', end_date: '2026-11-02' });
    expect(inp.startDate).toBe('2026-11-01');
    expect(api.eventDatePayload(true, '2026-11-01', '', '', '')).toEqual({
      all_day: true, start_date: '2026-11-01', end_date: '2026-11-01',
    });
  });

  it('writes min_participants, and never the junctions or non-columns', () => {
    const save = SRC.slice(SRC.indexOf('async function saveItem('), SRC.indexOf('// ── Form field helpers'));
    expect(save).toContain('payload.min_participants');
    expect(save).not.toMatch(/payload\.(teams|min_players|required_participants)\b/);
  });
});

describe('F-10 — Mixed-Turnier reads the server-built routes', () => {
  const rows = load<(d: unknown) => Array<Record<string, unknown>>>(['function mixedTurnierRows('], 'mixedTurnierRows');

  it('maps app and website rows', () => {
    const out = rows([
      { name: 'Anna M', sex: 'w', positions: ['Libero', 'Zuspiel'], date: '2026-09-01', source: 'wiedisync' },
      { name: 'Ben', sex: 'm', positions: 'Aussen > Mitte', source: 'wiedisync' },
      { name: 'Cleo', email: 'c@x.ch', sex: 'w', teams: ['D1'], position_1: 'Diagonal', notes: 'hi', source: 'website' },
    ]);
    expect(out[0]).toMatchObject({ name: 'Anna M', position_1: 'Libero', position_2: 'Zuspiel', source: 'wiedisync', email: '' });
    expect(out[1]).toMatchObject({ position_1: 'Aussen', position_2: 'Mitte' });
    expect(out[2]).toMatchObject({ email: 'c@x.ch', teams: ['D1'], position_1: 'Diagonal', notes: 'hi', source: 'website' });
  });

  it('no longer touches the out-of-scope collections, and checks res.ok', () => {
    expect(SRC).not.toMatch(/items\/(participations|members|mixed_tournament_signups)/);
    const tab = SRC.slice(SRC.indexOf("if (currentTab === 'mixed_turnier') {"), SRC.indexOf('// ── Seitentexte tab ──'));
    expect(tab).toContain("wadmin('mixed_turnier', sub, {})");
    expect(tab).toContain("if (!res.ok) throw new Error('HTTP ' + res.status);");
  });
});

describe('F-24 — lists are paged, not truncated', () => {
  const makeWadminAll = (pages: Array<{ ok: boolean; status?: number; data?: unknown[] }>) => {
    const calls: string[] = [];
    const wadmin = async (_s: string, path: string) => {
      calls.push(path);
      const p = pages[calls.length - 1] || { ok: true, data: [] };
      return { ok: p.ok, status: p.status || 200, json: async () => ({ data: p.data }) };
    };
    const fn = new Function('wadmin', `${snippet('var WADMIN_PAGE_SIZE')}\n${snippet('var WADMIN_MAX_PAGES')}\n${snippet('async function wadminAll(')}\nreturn wadminAll;`)(wadmin);
    return { fn: fn as (s: string, p: string) => Promise<unknown[]>, calls };
  };

  it('walks pages until a short one', async () => {
    const full = Array.from({ length: 200 }, (_, i) => i);
    const { fn, calls } = makeWadminAll([{ ok: true, data: full }, { ok: true, data: [1, 2] }]);
    expect((await fn('registrations', 'items/registrations?sort=-submitted_at')).length).toBe(202);
    expect(calls).toEqual([
      'items/registrations?sort=-submitted_at&limit=200&page=1',
      'items/registrations?sort=-submitted_at&limit=200&page=2',
    ]);
  });

  it('a refused read is an error, not an empty list', async () => {
    const { fn } = makeWadminAll([{ ok: false, status: 403 }]);
    await expect(fn('news', 'items/news')).rejects.toThrow('HTTP 403');
  });

  // The wadmin OpnForm proxy (opnform.js listSubmissions) answers
  // { fields, data, total, page, per_page, last_page } — last_page at the TOP level.
  const makeFetchAll = (pages: Array<{ ok: boolean; status?: number; body?: Record<string, unknown> }>) => {
    const calls: string[] = [];
    const wadmin = (_s: string, path: string) => {
      calls.push(path);
      const p = pages[calls.length - 1] || { ok: true, body: { data: [] } };
      return Promise.resolve({ ok: p.ok, status: p.status || 200, json: async () => p.body || {} });
    };
    const fn = new Function('wadmin', `${snippet('var SUBMISSION_MAX_PAGES')}\n${snippet('function fetchAllSubmissions(')}\nreturn fetchAllSubmissions;`)(wadmin);
    return { fn: fn as (src: { slug: string }) => Promise<any>, calls };
  };

  it('submissions: follows last_page and concatenates every page', async () => {
    const { fn, calls } = makeFetchAll([
      { ok: true, body: { fields: [{ id: 'f' }], data: [{ id: 1 }], page: 1, last_page: 3 } },
      { ok: true, body: { fields: [{ id: 'f' }], data: [{ id: 2 }], page: 2, last_page: 3 } },
      { ok: true, body: { fields: [{ id: 'f' }], data: [{ id: 3 }], page: 3, last_page: 3 } },
    ]);
    const out = await fn({ slug: 'sk-de' });
    expect(out.payload.data.map((r: { id: number }) => r.id)).toEqual([1, 2, 3]);
    expect(out.payload.fields).toEqual([{ id: 'f' }]);
    expect(calls).toEqual([1, 2, 3].map((n) => `opnform/forms/sk-de/submissions?per_page=100&page=${n}`));
  });

  it('submissions: a single page (or no last_page) stops after one request', async () => {
    const { fn, calls } = makeFetchAll([{ ok: true, body: { data: [{ id: 1 }] } }]);
    expect((await fn({ slug: 'x' })).payload.data).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('submissions: a runaway last_page is capped, and a failed page is an error', async () => {
    const many = Array.from({ length: 40 }, () => ({ ok: true, body: { data: [{}], last_page: 999 } }));
    const capped = makeFetchAll(many);
    await capped.fn({ slug: 'x' });
    expect(capped.calls).toHaveLength(20);
    const failing = makeFetchAll([{ ok: true, body: { data: [], last_page: 2 } }, { ok: false, status: 502 }]);
    expect(await failing.fn({ slug: 'x' })).toEqual({ src: { slug: 'x' }, error: 'HTTP 502' });
  });

  it('no 50-row cap is left', () => {
    expect(SRC).not.toMatch(/[&?]limit=50\b/);
    expect(SRC).not.toMatch(/submissions\?per_page=100', \{\}\)\s*\n\s*\.then/);
  });
});

describe('F-65 / F-64 — token refresh and logout', () => {
  function harness(refreshBody: unknown = { data: { access_token: 'new', refresh_token: 'r2', expires: 900000 } }) {
    const store: Record<string, string> = {
      auth: JSON.stringify({ access_token: 'old', refresh_token: 'r1', expires_at: Date.now() - 1 }),
    };
    const sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
    const calls: Array<{ url: string; body: string }> = [];
    const fetch = async (url: string, o: { body: string }) => {
      calls.push({ url, body: o.body });
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, json: async () => refreshBody };
    };
    const api = new Function('sessionStorage', 'fetch', `
      var DIRECTUS_URL = 'https://d'; var AUTH_KEY = 'auth';
      ${snippet('function storeAuth(')}
      ${snippet('function getAuth(')}
      ${snippet('var refreshPromise')}
      ${snippet('function refreshAuth(')}
      ${snippet('async function getValidToken(')}
      ${snippet('async function logoutAdmin(')}
      return { getValidToken: getValidToken, logoutAdmin: logoutAdmin };
    `)(sessionStorage, fetch);
    return { api, calls, store };
  }

  it('concurrent callers share one refresh', async () => {
    const { api, calls } = harness();
    const tokens = await Promise.all([api.getValidToken(), api.getValidToken(), api.getValidToken()]);
    expect(tokens).toEqual(['new', 'new', 'new']);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('logout revokes the refresh token and drops the session at once', async () => {
    const { api, calls, store } = harness();
    const p = api.logoutAdmin();
    expect(store.auth).toBeUndefined(); // synchronous: a login racing the revoke is not wiped
    await p;
    expect(calls).toEqual([{ url: 'https://d/auth/logout', body: JSON.stringify({ refresh_token: 'r1', mode: 'json' }) }]);
  });

  it('every logout path goes through it', () => {
    expect(SRC.match(/logoutAdmin\(\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SRC).not.toMatch(/sessionStorage\.removeItem\(AUTH_KEY\);\s*\n\s*render\(\);/);
  });
});

describe('wiring pins', () => {
  it('F-63: quill.snow.css carries SRI', () => {
    expect(SRC).toMatch(/quill@2\.0\.3\/dist\/quill\.snow\.css" rel="stylesheet" integrity="sha384-[A-Za-z0-9+/=]{64}" crossorigin="anonymous"/);
  });

  it('F-18: the verdict mail waits for the verdict save', () => {
    expect(SRC).toMatch(/saveScorerField\(rowMeta, 'exam_result', answer, statusEl\)\.then\(function\(saved\) \{\s*\n\s*if \(saved\) sendExamResultMail\(/);
    expect(SRC).toMatch(/return true; \},\s*\n\s*function\(\) \{ setScorerStatus\(statusEl, 'error'\); return false; \}\);/);
  });

  it('F-21: registration documents go through the wadmin file route only', () => {
    expect(SRC).not.toMatch(/\/assets\/' \+ (item|files\[i\])\.(id_upload|bb_doc|id\b)/);
    expect(SRC).not.toMatch(/DIRECTUS_URL \+ '\/files\/'/);
    expect(SRC).toContain("wadmin('registrations', 'files/' + encodeURIComponent(fileId), { method: 'DELETE' })");
    expect(SRC).toContain("var delRes = await wadmin('registrations', 'items/registrations/' + id, { method: 'DELETE' });");
  });

  it('F-25: the event Signups button is superuser-only', () => {
    expect(SRC).toContain("if (currentTab === 'events' && item.signup_url && adminAccess.isSuperuser) {");
  });

  it('F-28: the title is translated only on the button, into a visible field', () => {
    expect(SRC).not.toContain('translateTimer');
    expect(SRC).not.toContain('<input type="hidden" name="title_en"');
    expect(SRC).toContain('<input type="text" name="title_en" id="f-title_en"');
    const i = SRC.indexOf("translateBtn.addEventListener('click'");
    expect(i).toBeGreaterThan(-1);
  });

  it('C5: form slugs are sent only by a superuser, and only when edited; exam file fields never via generic CRUD', () => {
    expect(SRC).toMatch(/if \(adminAccess\.isSuperuser\) \{\s*\n\s*\['form_slug_de', 'form_slug_en'\]\.forEach/);
    // An untouched stored slug is never re-sent (and so never rewritten by normalizeFormSlug).
    expect(SRC).toContain("if (typed !== stored) payload[k] = normalizeFormSlug(typed) || null;");
    expect(SRC).not.toMatch(/payload\.form_slug_(de|en) = /);
    expect(SRC).not.toMatch(/saveScorerField\(rowMeta, 'exam_file/);
  });

  it('C5: a 403 field_not_writable on save names the refused field', () => {
    expect(SRC).toContain("if (res.status === 403 && errData.error === 'field_not_writable') {");
    expect(SRC).toMatch(/scFieldNotWritable: 'Dieses Feld/);
    expect(SRC).toMatch(/scFieldNotWritable: 'Only a superuser/);
  });

  it('F-18: a 409 result_not_saved is reported as "not saved", never as "recorded"', () => {
    const fn = snippet('function sendExamResultMail(');
    expect(fn).toContain("mailErr.code = body.error || '';");
    const i = fn.indexOf("err.code === 'result_not_saved'");
    expect(i).toBeGreaterThan(-1);
    expect(fn.indexOf("t('scExamResultNotSaved')", i)).toBeGreaterThan(i);
    // The generic "result recorded — mail failed" toast comes only after that branch returned.
    expect(fn.indexOf("t('scExamResultMailFailed')")).toBeGreaterThan(fn.indexOf("t('scExamResultNotSaved')"));
  });

  it('F-41: the backend comes from window.__KSCW_DIRECTUS, restricted to the two known hosts', () => {
    const setAt = SRC.indexOf('window.__KSCW_DIRECTUS = (h ===');
    const readAt = SRC.indexOf('var DIRECTUS_URL = (window.__KSCW_DIRECTUS');
    expect(setAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(setAt);
    expect(SRC).toContain("const KNOWN_DIRECTUS = ['https://directus.kscw.ch', 'https://directus-dev.kscw.ch'];");
    expect(SRC).toContain("window.__KSCW_DIRECTUS === 'https://directus.kscw.ch'");
    expect(SRC).toContain("|| window.__KSCW_DIRECTUS === 'https://directus-dev.kscw.ch')");
  });
});

describe('F-19 — the CSV and TSV guards stay the same rule', () => {
  it('csvSafe inlines exactly formulaSafe\'s pattern', () => {
    const re = /\/\^\[=\+\\-@\\t\\r\]\//;
    expect(snippet('function formulaSafe(')).toMatch(re);
    expect(snippet('function csvSafe(')).toMatch(re);
  });
});

describe('F-26 — no decorative captcha on the login', () => {
  it('ships no Turnstile widget that nothing verifies', () => {
    expect(SRC).not.toContain('challenges.cloudflare.com/turnstile');
    expect(SRC).not.toContain('X-Turnstile-Token');
  });
});

describe('F-21 — registration documents never render in the admin origin', () => {
  type Disp = { inline: boolean; type: string };
  const disp = load<(t: string | null) => Disp>(
    ['var REG_FILE_INLINE_RE', 'function registrationFileDisposition('], 'registrationFileDisposition');

  it.each(['image/png', 'image/jpeg', 'image/webp', 'IMAGE/PNG; charset=binary'])('%s is shown inline', (t) => {
    const d = disp(t);
    expect(d.inline).toBe(true);
    expect(d.type).toMatch(/^image\/(png|jpeg|webp)$/);
  });

  it.each(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/pdf', '', null])(
    '%j is downloaded as an opaque blob', (t) => {
      expect(disp(t)).toEqual({ inline: false, type: 'application/octet-stream' });
    });

  it('the view button re-types the blob instead of trusting the response type', () => {
    const fn = snippet('function openRegistrationFile(');
    expect(fn).toContain('new Blob([raw], { type: disp.type })');
    expect(fn).toContain('downloadBlob(');
  });

  it('the scoresheet viewer never builds its fallback blob from the served type', () => {
    const fn = snippet('async function scoresheetAsPdf(');
    expect(fn).toContain('registrationFileDisposition(type).type');
    expect(fn).not.toContain("type: type || 'application/octet-stream'");
  });

  it('rejecting deletes every document column before the row, and checks the read', () => {
    const fn = snippet('async function updateRegistrationStatus(');
    expect(fn).toContain('if (!itemRes.ok)');
    expect(fn).toContain('REGISTRATION_DOC_COLUMNS');
    expect(fn.indexOf('deleteRegistrationFile')).toBeLessThan(fn.indexOf("{ method: 'DELETE' }"));
    const cols = snippet('var REGISTRATION_DOC_COLUMNS');
    expect(cols).toBe('var REGISTRATION_DOC_COLUMNS = [');
    for (const c of ['id_upload_front', 'id_upload_back', 'bb_doc_lizenz', 'bb_doc_freibrief', 'bb_doc_selfdecl',
      'bb_doc_natdecl', 'bb_doc_u18parents', 'bb_doc_schoolcert']) {
      expect(SRC.slice(SRC.indexOf('var REGISTRATION_DOC_COLUMNS'), SRC.indexOf('];', SRC.indexOf('var REGISTRATION_DOC_COLUMNS')))).toContain(`'${c}'`);
    }
  });
});
