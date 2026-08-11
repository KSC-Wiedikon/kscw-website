/**
 * The admin page-text editor (/admin → Seitentexte).
 *
 * Two things are worth pinning here, and they are both invariants the feature
 * would fail quietly without:
 *
 *  1. **The manifest actually finds the text.** It is derived from the page
 *     sources, which is what keeps it from rotting — but it also means a change to
 *     how a page binds its strings could silently empty a page's editable list. A
 *     page missing from the manifest is a page nobody can edit, with no error.
 *
 *  2. **Overrides that would break a page never reach the build.** The Directus
 *     endpoint vets shape; only this side holds the dictionaries, so only this side
 *     can tell that a key exists and that a {placeholder} survived the edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';
import { GET } from '../../src/pages/site-text-manifest.json';
import { sanitize, placeholders } from '../../scripts/fetch-site-text.mjs';

const ROOT = process.cwd();
const dicts = {
  de: de as Record<string, string>,
  en: en as Record<string, string>,
};

interface ManifestKey { key: string; kind: 'text' | 'attr' | 'meta' }
interface ManifestGroup {
  id: string; kind: 'page' | 'component'; path: string; labelKey?: string; keys: ManifestKey[];
}

const manifest = await (GET() as Response).json() as { groups: ManifestGroup[]; keyCount: number };
const group = (path: string) => manifest.groups.find((g) => g.path === path);

describe('site-text manifest', () => {
  it('covers every page that renders text', () => {
    const pages = manifest.groups.filter((g) => g.kind === 'page');
    // 28 .astro pages today, minus admin.astro and any with no text of their own.
    expect(pages.length).toBeGreaterThanOrEqual(20);
    expect(manifest.keyCount).toBeGreaterThan(400);
  });

  it('lists a page\'s strings in the order they appear on it', () => {
    const keys = group('/volleyball/spielplanung')!.keys.map((k) => k.key);
    // The intro paragraph precedes the Spielsamstage section, which precedes the halls.
    expect(keys.indexOf('schedulingIntroText1')).toBeLessThan(keys.indexOf('schedulingSaturdaysText'));
    expect(keys.indexOf('schedulingSaturdaysText')).toBeLessThan(keys.indexOf('volleyballSpielplanungHall1Desc'));
  });

  it('classifies document metadata apart from on-page copy', () => {
    const keys = group('/volleyball/spielplanung')!.keys;
    const kindOf = (key: string) => keys.find((k) => k.key === key)?.kind;

    expect(kindOf('volleyballSpielplanungMetaTitle')).toBe('meta');
    expect(kindOf('volleyballSpielplanungMetaDescription')).toBe('meta');
    // A SectionHeader titleKey is a heading the visitor reads, not page metadata —
    // both arrive as `titleKey`, so only the position inside the layout tag separates them.
    expect(kindOf('contactTitle')).toBe('text');
    expect(kindOf('schedulingSaturdaysText')).toBe('text');
  });

  it('picks up attribute-only strings', () => {
    const logos = group('/weiteres/logos')!.keys;
    expect(logos.find((k) => k.key === 'weiteresLogosAltBlue')?.kind).toBe('attr');
  });

  it('offers the shared header and footer as their own groups', () => {
    const shared = manifest.groups.filter((g) => g.kind === 'component').map((g) => g.path);
    expect(shared).toContain('Header');
    expect(shared).toContain('Footer');
  });

  it('never offers the admin tool\'s own chrome', () => {
    // Renaming "Speichern" from inside the editor would break the button the admin
    // needs to undo it.
    expect(manifest.groups.map((g) => g.path)).not.toContain('/admin');
  });

  it('only lists keys the dictionaries can supply a value for', () => {
    const unknown = manifest.groups
      .flatMap((g) => g.keys.map((k) => k.key))
      .filter((key) => !(key in dicts.de) || !(key in dicts.en));

    expect(unknown).toEqual([]);
  });

  it('leaves no string unreachable', () => {
    // The scans cannot attribute every key to a page — team-page.js builds
    // posSetter/posLibero from data, so those literals exist in no source file. The
    // catch-all group is what stops a visitor-visible string from being uneditable
    // with nothing to explain why, so assert the total, not just the attributed part.
    const offered = new Set(manifest.groups.flatMap((g) => g.keys.map((k) => k.key)));
    const missing = Object.keys(dicts.de).filter((key) => !offered.has(key));

    expect(missing).toEqual([]);
    expect(offered.size).toBe(Object.keys(dicts.de).length);
  });

  it('attributes a key to one place only', () => {
    // A key offered under both its page and the catch-all would show two rows whose
    // values diverge as soon as one is saved.
    const seen = new Map<string, string[]>();
    for (const g of manifest.groups) {
      for (const { key } of g.keys) seen.set(key, [...(seen.get(key) ?? []), g.id]);
    }
    const shared = [...seen.entries()].filter(([, ids]) => ids.length > 1);

    // Pages legitimately share keys (contactTitle appears on several); the catch-all
    // must never be one of the places.
    const withCatchAll = shared.filter(([, ids]) => ids.includes('other'));
    expect(withCatchAll).toEqual([]);
  });

  it('exposes the page heading as a label where one exists', () => {
    const g = group('/volleyball/spielplanung')!;
    expect(g.labelKey).toBe('schedulingTitle');
    expect(dicts.de[g.labelKey!]).toBeTruthy();
  });
});

describe('every string the editor offers is reachable from the dictionary', () => {
  /**
   * A `data-i18n` element whose German is a hardcoded literal renders correctly
   * today but ignores its override at build time: `t()` is never consulted for it,
   * so the German HTML keeps the committed wording while the browser patches it on
   * every load. That divergence is invisible in review — this is the test that
   * catches a new one being introduced.
   */
  /**
   * A route maps to `<path>.astro` or `<path>/index.astro`. Resolving only the
   * first silently skipped every directory-index page — /news, /volleyball,
   * /sponsoren — which is most of the site, so the guard has to resolve both and
   * fail when neither exists rather than `continue`.
   */
  const sourceOf = (routePath: string): string => {
    const base = routePath === '/' ? 'src/pages/index' : `src/pages${routePath}`;
    for (const candidate of [`${base}.astro`, `${base}/index.astro`]) {
      try { readFileSync(resolve(ROOT, candidate), 'utf8'); return candidate; }
      catch { /* try the next shape */ }
    }
    throw new Error(`no source file for route ${routePath}`);
  };

  it('resolves a source file for every page in the manifest', () => {
    const pages = manifest.groups.filter((g) => g.kind === 'page');
    expect(() => pages.map((g) => sourceOf(g.path))).not.toThrow();
    // Guard against the guard passing because it checked nothing.
    expect(pages.length).toBeGreaterThan(20);
  });

  it('no page hardcodes the German of a data-i18n element', () => {
    const files = manifest.groups
      .filter((g) => g.kind === 'page')
      .map((g) => sourceOf(g.path))
      // Header/Footer are component groups; their own literals are covered below.
      .concat(['src/components/Header.astro', 'src/components/Footer.astro']);

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      for (const match of src.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
        const [, key, body] = match;
        const text = body.trim();
        // Empty (JS fills it) or an expression — both fine. A bare literal is not.
        if (text === '' || text.startsWith('{')) continue;
        offenders.push(`${file} [${key}]: ${text.slice(0, 40)}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('override sanitising (build side)', () => {
  const run = (raw: unknown) => sanitize(raw, dicts);

  it('keeps a valid override', () => {
    const { clean, dropped } = run({ de: { schedulingSaturdaysText: 'Neuer Text.' }, en: {} });
    expect(clean.de.schedulingSaturdaysText).toBe('Neuer Text.');
    expect(dropped).toBe(0);
  });

  it('drops a key the dictionary does not have', () => {
    // A typo, or a key deleted from the repo after the override was saved.
    const { clean, dropped } = run({ de: { noSuchKeyAnywhere: 'x' }, en: {} });
    expect(clean.de).toEqual({});
    expect(dropped).toBe(1);
  });

  it('drops markup', () => {
    const { clean, dropped } = run({ de: { schedulingSaturdaysText: 'Hallo <b>x</b>' }, en: {} });
    expect(clean.de).toEqual({});
    expect(dropped).toBe(1);
  });

  it('drops an override that loses a placeholder', () => {
    const key = Object.keys(dicts.de).find((k) => /\{[a-zA-Z0-9_]+\}/.test(dicts.de[k]));
    // Only meaningful if the dictionary still uses placeholders somewhere.
    if (!key) return;
    const { clean, dropped } = run({ de: { [key]: 'Text ohne Platzhalter' }, en: {} });
    expect(clean.de).toEqual({});
    expect(dropped).toBe(1);
  });

  it('keeps an override that carries its placeholders over', () => {
    const key = Object.keys(dicts.de).find((k) => /\{[a-zA-Z0-9_]+\}/.test(dicts.de[k]));
    if (!key) return;
    const ph = [...placeholders(dicts.de[key])].join(' ');
    const { clean } = run({ de: { [key]: `Neu ${ph}` }, en: {} });
    expect(clean.de[key]).toBe(`Neu ${ph}`);
  });

  it('drops non-strings and blanks', () => {
    const { clean, dropped } = run({
      de: { schedulingSaturdaysText: 42, schedulingIntroText1: '   ' },
      en: {},
    });
    expect(clean.de).toEqual({});
    expect(dropped).toBe(2);
  });

  it('drops an override identical to the shipped text', () => {
    // Dead weight in every page of the build, and it would show as "changed".
    const { clean } = run({ de: { schedulingSaturdaysText: dicts.de.schedulingSaturdaysText }, en: {} });
    expect(clean.de).toEqual({});
  });

  it('survives a malformed payload', () => {
    // Directus reachable but returning something unexpected must not fail a deploy.
    for (const bad of [null, undefined, 'nope', 42, { de: 'not-an-object' }, {}]) {
      expect(() => run(bad)).not.toThrow();
    }
  });
});

describe('the committed overrides file', () => {
  /**
   * Committed rather than generated-and-ignored, so a fresh checkout (and `npx
   * vitest`, and an IDE) can resolve the import with no Directus access. It is
   * rewritten by the `prebuild` step on every build, so its contents here are a
   * cache, not a decision — a build with Directus reachable replaces them, and a
   * build without one ships them, which is the intended degradation.
   *
   * Deliberately NOT asserted to be empty: a local `npm run build` legitimately
   * fills it in, and a test that failed afterwards would be punishing the normal
   * workflow. What must hold is that whatever is in it is applicable.
   */
  it('holds a usable overlay for both languages', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/generated/site-text.json'), 'utf8'));
    expect(Object.keys(raw).sort()).toEqual(['de', 'en']);

    for (const lang of ['de', 'en'] as const) {
      // Anything in here was already vetted by sanitize() on the way in; this
      // catches a hand-edit, or a merge that mangled the file.
      const { clean, dropped } = sanitize(raw, dicts);
      expect(dropped, `unusable overrides in site-text.json (${lang})`).toBe(0);
      expect(Object.keys(clean[lang]).length).toBe(Object.keys(raw[lang]).length);
    }
  });

  it('is layered over the dictionaries by the build-time t()', () => {
    const src = readFileSync(resolve(ROOT, 'src/lib/i18n.ts'), 'utf8');
    expect(src).toMatch(/generated\/site-text\.json/);
    expect(src).toMatch(/\.\.\.overrides\.de/);
    expect(src).toMatch(/\.\.\.overrides\.en/);
  });
});
