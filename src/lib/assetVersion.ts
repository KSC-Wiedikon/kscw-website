/**
 * Build-time cache-busters for the `public/js/` runtime scripts.
 *
 * These files are served with `Cache-Control: max-age=14400` (public/_headers),
 * so a browser may reuse a copy for four hours without revalidating. Their
 * `?v=` query string is what makes a changed file a different URL.
 *
 * It used to be a hand-written version number, and on 2026-07-27 that failed
 * exactly the way hand-written versions do: a new validation rule shipped in
 * `registration-form.js` without a `?v=` bump, and REG-2026-6400 was submitted
 * ~22h later from a cached bundle that never ran it — a volleyball registration
 * with no federation of origin, which the new rule exists to prevent.
 *
 * So the version is derived from the file's CONTENT instead. Change the script
 * and the URL changes; there is nothing left to remember. Astro frontmatter
 * runs in Node at build time, so this is a build-time read that never reaches
 * the browser.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `public/`, anchored to the project root.
 *
 * Deliberately NOT resolved from `import.meta.url`: Astro bundles this module
 * into `dist/.prerender/chunks/` before running it, so a module-relative path
 * resolves to `dist/public/` during the prerender and the read fails. Both
 * `astro build` and `vitest` run from the project root.
 */
const PUBLIC_DIR = resolve(process.cwd(), 'public');

const cache = new Map<string, string>();

/**
 * Content hash for a file in `public/`, as a short hex string.
 *
 * @param publicPath path relative to `public/`, e.g. `js/registration-form.js`
 * @returns 8 hex chars — 4 bytes of SHA-256, ample for cache-busting
 *
 * A missing file throws rather than degrading to a constant: the alternative is
 * a page that silently ships a broken script reference, which is the failure
 * this module exists to prevent.
 */
export function assetVersion(publicPath: string): string {
  const cached = cache.get(publicPath);
  if (cached) return cached;

  const file = resolve(PUBLIC_DIR, publicPath);
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (cause) {
    throw new Error(`assetVersion: cannot read public/${publicPath}`, { cause });
  }

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  cache.set(publicPath, hash);
  return hash;
}

/** `"/js/registration-form.js?v=<hash>"` — ready for a `src` attribute. */
export function versionedAsset(publicPath: string): string {
  return `/${publicPath}?v=${assetVersion(publicPath)}`;
}
