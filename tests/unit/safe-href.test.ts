/**
 * Unit tests for the href scheme guard — `safeHref` in `src/lib/safeHref.ts`
 * and its runtime twin `public/js/safe-href.js`.
 *
 * Why this matters more here than on a typical site: `public/_headers` ships
 * `script-src 'unsafe-inline'`, and SECURITY.md records that deferral as safe
 * *because the stored-XSS sinks are all closed*. A `javascript:` URL reaching
 * an `href` reopens one — it executes on click. Sponsor `website_url` is
 * admin-authored in Directus and lands in `a.href` in three places.
 *
 * The last block is the anti-drift harness. `safeHref` exists twice — TypeScript
 * for the statically-rendered sponsors page, ES5 for the two browser contexts
 * that cannot import a module (the `is:inline` sponsor carousel in
 * `src/pages/index.astro` and the unbundled `public/js/team-page.js`). The whole
 * corpus runs through BOTH with identical expectations, so the copies cannot
 * drift silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { safeHref } from '../../src/lib/safeHref';

/** Load the ES5 twin the way a browser would, and hand back its export. */
function loadRuntimeTwin(): (raw: unknown) => string {
  const src = readFileSync(resolve(process.cwd(), 'public/js/safe-href.js'), 'utf8');
  const sandbox: { kscwSafeHref?: (raw: unknown) => string } = {};
  // The file is an IIFE that assigns to `window`; give it one.
  new Function('window', src)(sandbox);
  if (typeof sandbox.kscwSafeHref !== 'function') {
    throw new Error('public/js/safe-href.js did not export window.kscwSafeHref');
  }
  return sandbox.kscwSafeHref;
}

// Built from char codes, never typed literally: the whole point of these cases
// is that the characters are invisible, so a source literal is one stray
// copy-paste away from silently testing nothing.
const NUL = String.fromCharCode(0x00);
const TAB = String.fromCharCode(0x09);
const LF = String.fromCharCode(0x0a);
const CR = String.fromCharCode(0x0d);

/** Values that must be refused. A rejection returns `''` — never a broken href. */
const REJECTED: Array<[string, string]> = [
  ['bare javascript:', 'javascript:alert(1)'],
  ['mixed case', 'JaVaScRiPt:alert(1)'],
  ['leading space', '  javascript:alert(1)'],
  ['leading control char', NUL + 'javascript:alert(1)'],
  ['embedded NUL', 'jav' + NUL + 'ascript:alert(1)'],
  ['embedded tab', 'jav' + TAB + 'ascript:alert(1)'],
  ['embedded newline', 'java' + LF + 'script:alert(1)'],
  ['embedded carriage return', 'java' + CR + 'script:alert(1)'],
  ['hex entity tab', 'jav&#x09;ascript:alert(1)'],
  ['decimal entity tab', 'jav&#09;ascript:alert(1)'],
  ['data: html', 'data:text/html,<script>alert(1)</script>'],
  ['data: base64', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['blob:', 'blob:https://kscw.ch/1234'],
  ['file:', 'file:///etc/passwd'],
  ['protocol-relative', '//evil.example'],
  ['protocol-relative with path', '//evil.example/logo.png'],
  ['protocol-relative, spaced', '  //evil.example'],
];

/** Values that must survive untouched — rejecting these would break the site. */
const ACCEPTED: Array<[string, string]> = [
  ['https', 'https://sponsor.example/'],
  ['http', 'http://sponsor.example/'],
  ['https with query', 'https://sponsor.example/?utm=1&ref=kscw'],
  ['https with encoded ampersand', 'https://sponsor.example/?a=1&#38;b=2'],
  ['uppercase scheme', 'HTTPS://sponsor.example/'],
  ['mailto', 'mailto:kontakt@kscw.ch'],
  ['tel', 'tel:+41441234567'],
  ['root-relative', '/weiteres/datenschutz'],
  ['fragment', '#kontakt'],
  ['query only', '?tab=news'],
];

describe('safeHref — rejects', () => {
  for (const [label, input] of REJECTED) {
    it(`refuses ${label}`, () => {
      expect(safeHref(input)).toBe('');
    });
  }

  it('refuses non-strings rather than coercing them', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(safeHref(value)).toBe('');
    }
  });

  it('refuses the empty string and strings that are only ignorable characters', () => {
    expect(safeHref('')).toBe('');
    expect(safeHref('   ')).toBe('');
    expect(safeHref(NUL + TAB + LF + CR)).toBe('');
  });
});

describe('safeHref — accepts', () => {
  for (const [label, input] of ACCEPTED) {
    it(`allows ${label}`, () => {
      expect(safeHref(input)).toBe(input);
    });
  }

  it('returns the ORIGINAL string, not the normalised one', () => {
    // The strip exists only to stop a scheme being smuggled past the check. It
    // must never be what gets rendered, or a URL with a legitimate (if odd)
    // character would be silently rewritten behind the admin's back.
    const url = ' https://sponsor.example/ ';
    expect(safeHref(url)).toBe(url);
  });

  it('does not mangle a legitimate &#38; in a query string', () => {
    // 0x26 is a printable character, so the entity expansion must leave it
    // alone — otherwise every sponsor URL with an encoded ampersand changes.
    expect(safeHref('https://x.example/?a=1&#38;b=2')).toContain('&#38;');
  });
});

describe('safeHref — a schemeless value is treated as relative', () => {
  // `example.com` has no scheme, so it resolves against our own origin as
  // `/sponsoren/example.com`. That is a broken link, not a dangerous one, and
  // the guard's job is only the second thing. Pinned so the behaviour is a
  // decision on record: if a bare host should become an https:// upgrade, that
  // belongs in the admin form, not inside a security guard.
  for (const input of ['example.com', 'www.example.com', 'sponsoren']) {
    it(`passes ${input} through unchanged`, () => {
      expect(safeHref(input)).toBe(input);
    });
  }
});

describe('safeHref — the runtime twin agrees with the build-time original', () => {
  const runtimeSafeHref = loadRuntimeTwin();
  const corpus = [
    ...REJECTED.map(([, input]) => input),
    ...ACCEPTED.map(([, input]) => input),
    'example.com',
    'www.example.com',
    'sponsoren',
    '',
    '   ',
    ' https://sponsor.example/ ',
    'jav&#x09ascript:alert(1)',
  ];

  it('exports window.kscwSafeHref', () => {
    expect(typeof runtimeSafeHref).toBe('function');
  });

  for (const input of corpus) {
    it(`agrees on ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(runtimeSafeHref(input)).toBe(safeHref(input));
    });
  }

  it('agrees on the non-string inputs too', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(runtimeSafeHref(value)).toBe(safeHref(value));
    }
  });
});

// ── No re-implemented href guard may survive under public/js/ ───────────────
// Two byte-identical weak copies of `safeUrl` lived in contact-form.js and
// youth-status.js. Both accepted a PROTOCOL-RELATIVE `//evil.example`, which
// inherits the page scheme and navigates off-site — the case the shared guard
// rejects explicitly (audit 2026-08-08, finding 16). SECURITY.md claimed "the
// pair cannot drift" while it was actually a quartet.
//
// The marker is the RETURNING shape — a helper that vets a URL and hands it
// back — not the presence of a scheme regex. news-modal.js also tests schemes,
// but as a DOMPurify post-pass that REMOVES any href which is not http(s)/
// mailto: stricter than the shared guard and fail-closed, so it is correctly
// not an offender here.
describe('no re-implemented href guards under public/js/', () => {
  it('no script vets-and-returns a URL instead of delegating to window.kscwSafeHref', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const base = fileURLToPath(new URL('../../public/js/', import.meta.url))
    const offenders: string[] = []
    for (const f of readdirSync(base)) {
      if (!f.endsWith('.js') || f === 'safe-href.js') continue
      // Strip comments first: the fix's own comment QUOTES the defective
      // expression to explain it, and a naive scan flags the explanation.
      const src = readFileSync(base + f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      // The exact defect: treating a leading "/" as proof a URL is local, which
      // waves "//evil.example" through.
      const acceptsProtocolRelative = /charAt\(0\)\s*===\s*['"]\/['"]/.test(src)
        || /\[0\]\s*===\s*['"]\/['"]/.test(src)
      // A local guard that hands a vetted URL back to a caller.
      const definesLocalGuard = /function\s+safe(?:Url|Href)\s*\(/.test(src)
        && !/window\.kscwSafeHref/.test(src)
      if (acceptsProtocolRelative || definesLocalGuard) offenders.push(f)
    }
    expect(offenders, `these re-implement the guard instead of using window.kscwSafeHref: ${offenders.join(', ')}`).toEqual([])
  })
})
