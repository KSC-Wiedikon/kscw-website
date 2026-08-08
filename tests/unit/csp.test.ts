/**
 * `public/_headers` as a snapshot-with-intent.
 *
 * This is the only real assertion point for the CSP. `astro preview` does not
 * apply `_headers` — Cloudflare Pages does, at the edge — so no e2e test can
 * observe it and no build step validates it. A typo here ships silently and is
 * discovered by whatever it breaks.
 *
 * The point is not to freeze the file. It is to make every widening of the
 * policy edit a test, so it lands in a diff a reviewer reads rather than in a
 * line nobody looks at. If you are here because a test failed: confirm the new
 * origin is intended, update the list, and note it in SECURITY.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEADERS = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');

const CSP_LINE = HEADERS.split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('Content-Security-Policy:'));

/** `{ 'script-src': ["'self'", 'https://unpkg.com', …], … }` */
function parseCsp(line: string): Record<string, string[]> {
  const policy = line.replace(/^Content-Security-Policy:\s*/, '');
  const out: Record<string, string[]> = {};
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    out[parts[0]] = parts.slice(1);
  }
  return out;
}

describe('public/_headers — Content-Security-Policy', () => {
  it('is present', () => {
    expect(CSP_LINE).toBeTruthy();
  });

  const csp = parseCsp(CSP_LINE as string);

  // ── The directives whose whole value is the security property ────────────

  it("object-src is exactly 'none' — no plugins, ever", () => {
    expect(csp['object-src']).toEqual(["'none'"]);
  });

  it("base-uri is exactly 'self' — a stray <base> must not repoint relative URLs", () => {
    expect(csp['base-uri']).toEqual(["'self'"]);
  });

  it("frame-ancestors is exactly 'self' — clickjacking guard", () => {
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
  });

  it("default-src is exactly 'self'", () => {
    expect(csp['default-src']).toEqual(["'self'"]);
  });

  // ── Exact allowlists ─────────────────────────────────────────────────────

  it('form-action allows only ourselves and the forms host', () => {
    expect(csp['form-action']).toEqual(["'self'", 'https://forms.kscw.ch']);
  });

  it('frame-src allows only the known embed hosts', () => {
    expect(csp['frame-src']).toEqual([
      "'self'",
      'https://challenges.cloudflare.com',
      'https://www.instagram.com',
      'https://www.svrz.ch',
      'https://readvolley.openvolley.app',
      'https://forms.kscw.ch',
    ]);
    // Deliberately absent: YouTube and Google Maps. Adding either is a CSP
    // change plus a consent-banner question under the Swiss DSG.
    expect(csp['frame-src'].join(' ')).not.toMatch(/youtube|google/i);
  });

  it('img-src allows only self, the two Directus hosts, OSM tiles and data:', () => {
    expect(csp['img-src']).toEqual([
      "'self'",
      'https://directus.kscw.ch',
      'https://directus-dev.kscw.ch',
      'https://*.tile.openstreetmap.org',
      'data:',
    ]);
  });

  it('connect-src carries no wildcard host beyond the two intended subdomains', () => {
    const wildcards = csp['connect-src'].filter((src) => src.includes('*'));
    expect(wildcards).toEqual(['https://*.ingest.de.sentry.io']);
  });

  // ── Blanket rules ────────────────────────────────────────────────────────

  it('no directive is opened to a bare wildcard or a bare scheme', () => {
    // `*`, `https:` or `http:` as a whole source value defeats the directive.
    const offenders: string[] = [];
    for (const [directive, sources] of Object.entries(csp)) {
      for (const src of sources) {
        if (src === '*' || src === 'https:' || src === 'http:' || src === "'unsafe-eval'") {
          offenders.push(`${directive}: ${src}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("script-src still carries 'unsafe-inline' — a KNOWN, documented deferral", () => {
    // Pinned so the premise stays visible: SECURITY.md justifies this by the
    // stored-XSS sinks all being closed. If this ever flips to absent, that is
    // good news and SECURITY.md's "Open / accepted" table should lose a row.
    expect(csp['script-src']).toContain("'unsafe-inline'");
  });
});

describe('public/_headers — transport and caching', () => {
  it('sets the baseline security headers site-wide', () => {
    expect(HEADERS).toContain('X-Content-Type-Options: nosniff');
    expect(HEADERS).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(HEADERS).toContain('X-Frame-Options: SAMEORIGIN');
    expect(HEADERS).toMatch(/Strict-Transport-Security: max-age=\d+; includeSubDomains/);
  });

  it('never emits a cross-origin read permission', () => {
    // SECURITY.md asserts this repo ships no CORS header. Keep it true.
    expect(HEADERS).not.toMatch(/Access-Control-Allow-Origin/i);
  });

  it('fingerprinted build assets are immutable', () => {
    expect(HEADERS).toMatch(/\/assets\/\*[\s\S]*?Cache-Control: public, max-age=31536000, immutable/);
  });
});
