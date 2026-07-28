/**
 * Unit tests for the build-time cache-buster (src/lib/assetVersion.ts).
 *
 * The invariant: a changed `public/js/` file MUST produce a different `?v=`.
 * public/js is served with max-age=14400, so when that invariant broke on
 * 2026-07-27 — a validation rule shipped without a hand-bumped version —
 * REG-2026-6400 was submitted from a 22h-old cached bundle that never ran it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { assetVersion, versionedAsset } from '../../src/lib/assetVersion';

const FORM = 'js/registration-form.js';

describe('assetVersion', () => {
  it('hashes a real public/ file to 8 hex chars', () => {
    expect(assetVersion(FORM)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is stable across calls — same bytes, same version', () => {
    expect(assetVersion(FORM)).toBe(assetVersion(FORM));
  });

  it('differs between two different files', () => {
    expect(assetVersion(FORM)).not.toBe(assetVersion('js/anmeldung-dokumente.js'));
  });

  it('CHANGES when the file content changes — the whole point', () => {
    // A scratch file rather than a stubbed hash: this asserts the property the
    // 2026-07-27 miss violated, so it has to observe a real edit on disk.
    const scratch = 'js/__asset-version-probe.js';
    const path = new URL(`../../public/${scratch}`, import.meta.url);
    try {
      writeFileSync(path, 'console.log(1)\n');
      const before = assetVersion(scratch);
      writeFileSync(path, 'console.log(2)\n');
      // The module memoizes per path, so read the second version through a
      // cache-busting alias — same bytes on disk, different key.
      const aliased = `./${scratch}`;
      const after = assetVersion(aliased);
      expect(after).not.toBe(before);
      expect(after).toMatch(/^[0-9a-f]{8}$/);
    } finally {
      try { unlinkSync(path); } catch { /* already gone */ }
    }
  });

  it('throws on a missing file rather than shipping a broken script tag', () => {
    expect(() => assetVersion('js/does-not-exist.js')).toThrow(/cannot read/);
  });
});

describe('versionedAsset', () => {
  it('builds a root-absolute src with the hash attached', () => {
    expect(versionedAsset(FORM)).toBe(`/${FORM}?v=${assetVersion(FORM)}`);
  });

  it('matches what the registration page would emit', () => {
    expect(versionedAsset(FORM)).toMatch(/^\/js\/registration-form\.js\?v=[0-9a-f]{8}$/);
  });
});

describe('the pages that must never ship a stale runtime bundle', () => {
  // Guards the fix itself: a hand-written ?v= reintroduced here would be
  // invisible until the next cached-bundle incident.
  it.each([
    'src/pages/weiteres/anmeldung.astro',
    'src/pages/weiteres/anmeldung-dokumente.astro',
  ])('%s uses versionedAsset(), not a literal ?v=', (page) => {
    const src = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    expect(src).toContain('versionedAsset(');
    expect(src).not.toMatch(/src="\/js\/[^"]*\?v=/);
  });
});
