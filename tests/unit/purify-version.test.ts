/**
 * Keeps the two DOMPurify copies pinned to the same version.
 *
 * There are two: `public/js/vendor/purify.min.js`, vendored so the news-body
 * sanitizer does not depend on a CDN's availability (audit WEB-SEC-4), and an
 * SRI-pinned `cdn.jsdelivr.net` tag in `src/pages/admin.astro`. Nothing links
 * them. They can drift to different versions — including one patched and one
 * not — with no error anywhere, and the SRI hash means the drift is invisible
 * rather than loud.
 *
 * Bumping is therefore a three-line edit: the constant here, the vendored file,
 * and the admin tag (URL **and** integrity hash together — a mismatched pair
 * fails closed and the admin page silently loses its sanitizer).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The version both copies must be on. Bump deliberately, never to chase a test. */
const PINNED = '3.2.4';

const ROOT = process.cwd();
const VENDORED = readFileSync(resolve(ROOT, 'public/js/vendor/purify.min.js'), 'utf8');
const ADMIN = readFileSync(resolve(ROOT, 'src/pages/admin.astro'), 'utf8');

describe('DOMPurify version pinning', () => {
  it('the vendored copy announces the pinned version in its banner', () => {
    const banner = VENDORED.slice(0, 400);
    expect(banner).toContain('DOMPurify');
    const match = banner.match(/DOMPurify (\d+\.\d+\.\d+)/);
    expect(match?.[1]).toBe(PINNED);
  });

  it('the admin CDN tag requests the pinned version', () => {
    const match = ADMIN.match(/dompurify@(\d+\.\d+\.\d+)\/dist\/purify\.min\.js/);
    expect(match?.[1]).toBe(PINNED);
  });

  it('the admin CDN tag carries an SRI hash and crossorigin', () => {
    // Without both, a compromised CDN response executes in a page where an
    // admin session lives. The hash is what makes the CDN untrusted-by-design.
    const tag = ADMIN.split('\n').find((l) => l.includes('dompurify@'));
    expect(tag).toBeTruthy();
    expect(tag).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
    expect(tag).toContain('crossorigin="anonymous"');
  });

  it('only one DOMPurify version appears anywhere in the repo surface', () => {
    const versions = new Set<string>();
    for (const src of [VENDORED.slice(0, 400), ADMIN]) {
      for (const m of src.matchAll(/(?:DOMPurify |dompurify@)(\d+\.\d+\.\d+)/g)) {
        versions.add(m[1]);
      }
    }
    expect([...versions]).toEqual([PINNED]);
  });
});
