/**
 * Regression pins for the public-runtime findings of the 2026-09-28 audit
 * (security, privacy and logic on the anonymous side of kscw.ch).
 *
 * Where a fix is pure logic it is executed; where the failure mode is a call
 * that goes missing or a URL that drifts back, the source is pinned — the same
 * split the repo's other security tests use (see i18n-href.test.ts).
 * The i18n engine findings (F-46 … F-49) live in i18n-runtime-engine.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { zurichToday, zurichToUTC, normalizeHHMM } from '../../src/lib/zurichTime';
import { PUBLISHED_NEWS_FILTER } from '../../src/lib/fetch/news';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** Source with comments removed, so an explanatory comment cannot satisfy a pin. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── F-53: one Zurich "today" ────────────────────────────────────────────────
describe('F-53 — today is the Zurich day', () => {
  it('rolls over at Zurich midnight, not UTC midnight', () => {
    // 22:30Z on 14 July = 00:30 CEST on 15 July.
    expect(zurichToday(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
    // 23:30Z on 14 January = 00:30 CET on 15 January.
    expect(zurichToday(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
    expect(zurichToday(new Date('2026-01-14T22:30:00Z'))).toBe('2026-01-14');
  });

  it('no script or lib computes "today" from the UTC ISO string', () => {
    const offenders: string[] = [];
    const dirs = ['public/js', 'src/lib', 'src/lib/fetch', 'src/islands'];
    for (const dir of dirs) {
      for (const f of readdirSync(resolve(ROOT, dir))) {
        if (!/\.(js|ts)$/.test(f)) continue;
        if (/new Date\(\)\.toISOString\(\)\.(slice\(0, ?10\)|split\('T'\))/.test(code(`${dir}/${f}`))) offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── F-11: scorer-course time parsing and render isolation ───────────────────
describe('F-11 — a bad course time cannot hide the scorer-course section', () => {
  it('normalises Swiss time spellings to HH:MM', () => {
    expect(normalizeHHMM('18:00')).toBe('18:00');
    expect(normalizeHHMM('18.00')).toBe('18:00');
    expect(normalizeHHMM('18h00')).toBe('18:00');
    expect(normalizeHHMM('8:05')).toBe('08:05');
    expect(normalizeHHMM('17:45:00')).toBe('17:45');
  });

  it('turns non-times into null instead of NaN', () => {
    for (const bad of ['', 'abends', '25:00', '18:60', '1800', null, undefined, 18]) {
      expect(normalizeHHMM(bad)).toBeNull();
    }
  });

  it('zurichToUTC resolves DST and returns null rather than an Invalid Date', () => {
    expect(zurichToUTC('2026-07-08', '18:00')?.toISOString()).toBe('2026-07-08T16:00:00.000Z');
    expect(zurichToUTC('2026-01-08', '18.00')?.toISOString()).toBe('2026-01-08T17:00:00.000Z');
    expect(zurichToUTC('2026-07-08', 'abends')).toBeNull();
    expect(zurichToUTC('bald', '18:00')).toBeNull();
  });

  it('the island isolates each card and un-hides the section in a finally', () => {
    const src = code('src/islands/scorer-courses.ts');
    expect(src).toMatch(/try \{\s*renderCard\(course, locale\);\s*\} catch/);
    expect(src).toMatch(/\} finally \{[\s\S]{0,200}section\.hidden = false/);
    expect(src).toMatch(/time: normalizeHHMM\(r\.time\)/);
    expect(src).toMatch(/if \(!start\) return ''/);
  });
});

// ── F-07: published-only news, second line of defence ───────────────────────
describe('F-07 — every news query filters on is_published', () => {
  it('the build-time query sends the filter', () => {
    expect(PUBLISHED_NEWS_FILTER).toEqual({ is_published: { _eq: true }, published_at: { _lte: '$NOW' } });
    expect(code('src/lib/fetch/news.ts')).toMatch(/filter: PUBLISHED_NEWS_FILTER/);
  });

  it.each(['src/pages/index.astro', 'src/pages/news/index.astro', 'public/js/news-modal.js'])(
    '%s sends it at runtime', (file) => {
      const src = code(file);
      const newsQuery = src.slice(src.indexOf('/items/news'));
      expect(newsQuery.length).toBeGreaterThan(0);
      expect(src).toMatch(/is_published: \{ _eq: true \}/);
    },
  );

  it('a refused homepage news query keeps the build-time cards', () => {
    const src = code('src/pages/index.astro');
    const block = src.slice(src.indexOf('function fetchNews'), src.indexOf('renderNews();', src.indexOf('function fetchNews')));
    expect(block).toMatch(/if \(!res\.ok\) throw/);
  });
});

// ── F-08: feedback posts to the endpoint that can parse it ──────────────────
describe('F-08 — website feedback form', () => {
  const src = code('public/js/feedback-form.js');

  it('posts to /kscw/public/feedback, never to /items/feedback', () => {
    expect(src).toContain("'/kscw/public/feedback'");
    expect(src).not.toContain('/items/feedback');
  });

  it('keeps the multipart field names the endpoint contract (C2) is built on', () => {
    const fields = [...src.matchAll(/formData\.append\('([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(fields).toEqual(['description', 'email', 'name', 'screenshot', 'source', 'source_url', 'status', 'title', 'type']);
    expect(src).toMatch(/'X-Turnstile-Token': data\.turnstileResponse/);
  });

  it('treats only {ok:true} as success', () => {
    expect(src).toMatch(/body\.ok !== true/);
  });
});

// ── F-29 / F-41: Sentry scrubbing, environment, backend selection ───────────
function inlineScripts(): string[] {
  const layout = read('src/layouts/BaseLayout.astro');
  return [...layout.matchAll(/<script is:inline(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function sentryOptions(hostname: string) {
  const script = inlineScripts().find((s) => s.includes('Sentry.init'))!;
  let captured: any = null;
  const Sentry = { init(o: unknown) { captured = o; } };
  new Function('Sentry', 'location', 'navigator', 'document', script)(
    Sentry, { hostname, origin: `https://${hostname}` }, { userAgent: 'Mozilla/5.0' }, { getElementById: () => null },
  );
  return captured;
}

describe('F-29 — Sentry never receives query strings', () => {
  const opts = sentryOptions('kscw.ch');

  it('strips the page URL, query string and Referer on events', () => {
    const event = {
      request: {
        url: 'https://kscw.ch/anmeldung/dokumente/?ref=REG-2026-1&email=a%40b.ch',
        query_string: 'ref=REG-2026-1&email=a%40b.ch',
        headers: { Referer: 'https://kscw.ch/news/?unsubscribe=tok', 'User-Agent': 'x' },
      },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://directus.kscw.ch/kscw/scorer-exam/upload?ticket=abc&name=x.pdf' } }],
    };
    const out = opts.beforeSend(event);
    expect(out.request.url).toBe('https://kscw.ch/anmeldung/dokumente/');
    expect(out.request.query_string).toBeUndefined();
    expect(out.request.headers.Referer).toBe('https://kscw.ch/news/');
    expect(out.breadcrumbs[0].data.url).toBe('https://directus.kscw.ch/kscw/scorer-exam/upload');
  });

  it('strips navigation and fetch breadcrumbs as they are recorded', () => {
    const nav = opts.beforeBreadcrumb({ category: 'navigation', data: { from: '/x?verify=t1', to: '/news/?unsubscribe=t2#top' } });
    expect(nav.data).toEqual({ from: '/x', to: '/news/' });
    const xhr = opts.beforeBreadcrumb({ category: 'fetch', data: { url: '/kscw/registration/doc-status?reference=R&email=e' } });
    expect(xhr.data.url).toBe('/kscw/registration/doc-status');
  });

  it('strips query strings from URLs quoted inside messages and exception text', () => {
    const crumb = opts.beforeBreadcrumb({ category: 'console', message: 'upload failed https://directus.kscw.ch/kscw/registration/upload?ticket=abc&filename=p.pdf (403)' });
    expect(crumb.message).toBe('upload failed https://directus.kscw.ch/kscw/registration/upload (403)');
    const out = opts.beforeSend({
      message: 'see https://kscw.ch/anmeldung/dokumente/?ref=R&email=e',
      exception: { values: [{ value: 'GET https://directus.kscw.ch/kscw/registration/doc-status?reference=R&email=e failed' }] },
    });
    expect(out.message).toBe('see https://kscw.ch/anmeldung/dokumente/');
    expect(out.exception.values[0].value).toBe('GET https://directus.kscw.ch/kscw/registration/doc-status failed');
  });

  it('anmeldung-dokumente drops ?ref=&email= from the address bar once read', () => {
    expect(read('public/js/anmeldung-dokumente.js')).toMatch(/history\.replaceState\(null, '', window\.location\.pathname\)/);
  });
});

describe('F-41 — previews are not production', () => {
  it('tags only the live hosts as production', () => {
    expect(sentryOptions('kscw.ch').environment).toBe('production');
    expect(sentryOptions('www.kscw.ch').environment).toBe('production');
    expect(sentryOptions('localhost').environment).toBe('development');
    expect(sentryOptions('dev.kscw-web.pages.dev').environment).toBe('preview');
  });

  function backendFor(hostname: string, buildDirectus: string) {
    const script = inlineScripts().find((s) => s.includes('__KSCW_DIRECTUS'))!;
    const win: Record<string, unknown> = {};
    new Function('window', 'location', 'buildDirectus', script)(win, { hostname }, buildDirectus);
    return win.__KSCW_DIRECTUS;
  }

  it('pins the live hosts to prod and localhost to dev, and lets a preview follow its build', () => {
    expect(backendFor('kscw.ch', 'https://directus-dev.kscw.ch')).toBe('https://directus.kscw.ch');
    expect(backendFor('localhost', 'https://directus.kscw.ch')).toBe('https://directus-dev.kscw.ch');
    expect(backendFor('abc.kscw-web.pages.dev', 'https://directus-dev.kscw.ch')).toBe('https://directus-dev.kscw.ch');
    expect(backendFor('abc.kscw-web.pages.dev', 'https://directus.kscw.ch')).toBe('https://directus.kscw.ch');
  });

  it('only accepts the two known Directus origins from the build env', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toMatch(/KNOWN_DIRECTUS\.includes\(envDirectus\) \? envDirectus : 'https:\/\/directus\.kscw\.ch'/);
  });

  it('no runtime script picks its backend by hostname alone', () => {
    const offenders: string[] = [];
    const files = [
      ...readdirSync(resolve(ROOT, 'public/js')).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
      'src/pages/index.astro', 'src/pages/news/index.astro', 'src/islands/calendar-grid.ts',
    ];
    for (const f of files) {
      const src = code(f);
      if (src.includes("'https://directus-dev.kscw.ch'") && !src.includes('__KSCW_DIRECTUS') && !src.includes('getDirectusUrl')) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── F-30 / F-31: newsletter links and Turnstile ─────────────────────────────
describe('F-30 / F-31 — newsletter form', () => {
  const src = code('public/js/newsletter-form.js');

  it('reports success for verify/unsubscribe only on a 2xx', () => {
    expect(src).toMatch(/if \(r\.ok\) return showFeedback\('success'/);
    expect(src).toMatch(/newsletterLinkInvalid/);
    expect(src).not.toMatch(/\.then\(function \(\) \{ showFeedback\('success', i18n\.t\('newsletterUnsubscribed'\)\)/);
  });

  it('resets the single-use Turnstile token after every attempt, not only on success', () => {
    expect(src).toMatch(/\.finally\(function \(\) \{[\s\S]{0,300}turnstile\.reset\(turnstileWidgetId\)/);
  });

  it('ships the new message in both languages', () => {
    const de = JSON.parse(read('public/js/i18n/de.json'));
    const en = JSON.parse(read('public/js/i18n/en.json'));
    expect(de.newsletterLinkInvalid).toBeTruthy();
    expect(en.newsletterLinkInvalid).toBeTruthy();
  });
});

// ── F-12 / F-50 / F-51 / F-52: games and trainings ──────────────────────────
describe('F-12 — team-page fixtures carry no 0:0 score', () => {
  const src = code('public/js/team-page.js');

  it('only builds a score for a played or provisional game', () => {
    expect(src).toMatch(/var hasScore = g\.status !== 'scheduled' \|\| !!g\.provisional;/);
  });

  it('passes the real status to the modal instead of deriving it from the score', () => {
    expect(src).toMatch(/status: g\.status \|\| \(g\.score \? 'completed' : 'scheduled'\)/);
  });
});

describe('F-50 — client trainings markup matches the build render', () => {
  it('emits the TeamTrainings.astro structure, Monday-first', () => {
    const src = code('public/js/team-page.js');
    expect(src).toMatch(/wrap\.className = 'training-pattern'/);
    expect(src).toMatch(/table\.className = 'training-table'/);
    expect(src).toMatch(/'weekdayLong' \+ w\.weekday/);
    expect(src).toMatch(/\(d\.getUTCDay\(\) \+ 6\) % 7/);
    expect(src).not.toMatch(/row\.className = 'training-item'/);
  });

  it('the component styles reach client-built rows (not Astro-scoped)', () => {
    expect(read('src/components/TeamTrainings.astro')).toMatch(/<style is:global>/);
  });
});

describe('F-51 / F-52 — homepage game tables', () => {
  const src = code('src/pages/index.astro');

  it('keeps completed games out of Upcoming', () => {
    expect(src).toMatch(/status: \{ _nin: \['cancelled', 'completed'\] \}/);
  });

  it('a played game is never shown as an upcoming livestream', () => {
    expect(code('public/js/game-modal.js')).toMatch(/if \(game\.status === 'completed' \|\| game\.provisional\) return false;/);
  });

  it('one failed fetch cannot leave both tables loading', () => {
    expect(src).toMatch(/\.catch\(function\(err\) \{ cachedGames\[dir\]\[sport\] = \[\];/);
  });
});

// ── F-57: scoreboard season choice ──────────────────────────────────────────
describe('F-57 — scoreboard season', () => {
  function pickSeason(): (rows: Array<{ season: string; team_id: string }>) => string | null {
    const win: Record<string, any> = { location: { hostname: 'kscw.ch' } };
    const doc = { readyState: 'complete', querySelectorAll: () => [], addEventListener: () => undefined };
    new Function('window', 'document', read('public/js/scoreboard.js'))(win, doc);
    return win.renderScoreboard.pickSeason;
  }

  it('stays on the finished season while only one team has new-season data', () => {
    const rows = [
      { season: '2025/26', team_id: 'vb_1' }, { season: '2025/26', team_id: 'vb_2' }, { season: '2025/26', team_id: 'vb_3' },
      { season: '2026/27', team_id: 'vb_1' },
    ];
    expect(pickSeason()(rows)).toBe('2025/26');
  });

  it('moves on once two teams have data', () => {
    const rows = [
      { season: '2025/26', team_id: 'vb_1' }, { season: '2025/26', team_id: 'vb_2' },
      { season: '2026/27', team_id: 'vb_1' }, { season: '2026/27', team_id: 'vb_2' },
    ];
    expect(pickSeason()(rows)).toBe('2026/27');
  });

  it('a sport with a single team still reaches its newest season', () => {
    const rows = [{ season: '2025/26', team_id: 'bb_1' }, { season: '2026/27', team_id: 'bb_1' }];
    expect(pickSeason()(rows)).toBe('2026/27');
  });
});

// ── F-54 / F-55 / PR-5 ──────────────────────────────────────────────────────
describe('F-54 — search uses versioned dictionaries and the live engine', () => {
  const src = code('public/js/search.js');
  it('appends the content hash', () => {
    expect(src).toMatch(/window\.__I18N_V/);
    expect(src).not.toMatch(/fetch\('\/js\/i18n\/(de|en)\.json'\)/);
  });
  it('labels through i18n.t so overrides apply', () => {
    expect(src).toMatch(/window\.i18n\.t\(key\)/);
  });
});

describe('F-55 — /news list dates are dd.mm.yyyy', () => {
  it('asks for 2-digit day and month', () => {
    const src = code('src/pages/news/index.astro');
    expect(src).not.toMatch(/toLocaleDateString\('de-CH', \{ timeZone: 'Europe\/Zurich' \}\)/);
    expect(src).toMatch(/day: '2-digit', month: '2-digit', year: 'numeric'/);
  });
});

describe('PR-5 — hall maps_url is vetted before it reaches an href', () => {
  it('game-modal.js routes it through kscwSafeHref and fails closed', () => {
    const src = code('public/js/game-modal.js');
    expect(src).toMatch(/window\.kscwSafeHref\(rawMapsUrl\) : ''/);
  });
  it('calendar-grid.ts routes it through safeHref', () => {
    expect(code('src/islands/calendar-grid.ts')).toMatch(/safeHref\(hall\?\.maps_url\)/);
  });
});

// ── F-09 (client): registration uploads carry the signed upload ticket ──────
describe('F-50 — client trainings weekday', () => {
  it('reads the weekday from the date part as UTC, so a zone-less timestamp cannot shift it', () => {
    expect(read('public/js/team-page.js')).toMatch(/new Date\(String\(t\.date\)\.slice\(0, 10\) \+ 'T00:00:00Z'\)/);
  });
});

describe('F-09 — registration uploads send the upload ticket', () => {
  it('the registration form buys a ticket with the first Turnstile solve and sends it', () => {
    const src = read('public/js/registration-form.js');
    expect(src).toMatch(/'\/kscw\/registration\/upload-ticket'/);
    expect(src).toMatch(/callback: function \(token\) \{ mintUploadTicket\(token\); \}/);
    expect(src).toMatch(/\(ticket \? '&ticket=' \+ encodeURIComponent\(ticket\) : ''\)/);
    // The ticket spends the token, so the widget must be reset for the submit.
    expect(src).toMatch(/mintUploadTicket[\s\S]{0,1500}turnstile\.reset\(turnstileWidgetId\)/);
  });

  it('renews an expired ticket once instead of uploading with a dead one', () => {
    const src = read('public/js/registration-form.js');
    expect(src).toMatch(/uploadTicketExpiresAt/);
    expect(src).toMatch(/Date\.now\(\) > uploadTicketExpiresAt/);
  });

  it('the documents page uses the ticket doc-status hands back', () => {
    const src = read('public/js/anmeldung-dokumente.js');
    expect(src).toMatch(/uploadTicket: typeof data\.upload_ticket === 'string'/);
    expect(src).toMatch(/\(ticket \? '&ticket=' \+ encodeURIComponent\(ticket\) : ''\)/);
  });
});
