/**
 * Guards the invariant Phase 0 established: **no translated value is ever
 * rendered as HTML.**
 *
 * This is the premise the whole content-overlay design rests on. Dictionary
 * values were once described in code as "static assets under our control" —
 * true while only developers could edit them, false the moment an admin can.
 * The `data-i18n-html` -> `innerHTML` path that relied on that premise is gone;
 * these tests stop it coming back.
 *
 * It also has to be a *test*, not a convention, because the failure is close to
 * invisible: German renders at build time through Astro's auto-escaping, so a
 * malicious dictionary value would execute **only in English**. A reviewer
 * clicking the entire site in German would see nothing wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = process.cwd();

/** Every file under `dir` whose name ends in one of `exts`. */
function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(resolve(ROOT, 'src'), ['.astro', '.ts', '.js']),
  ...walk(resolve(ROOT, 'public'), ['.js', '.html']),
].filter((f) => !f.includes(join('public', 'js', 'vendor')));

const DICTIONARIES = ['de', 'en'].map((lang) => ({
  lang,
  path: `public/js/i18n/${lang}.json`,
  values: JSON.parse(readFileSync(resolve(ROOT, `public/js/i18n/${lang}.json`), 'utf8')) as Record<string, string>,
}));

describe('no i18n value is ever treated as HTML', () => {
  it('the data-i18n-html attribute exists nowhere', () => {
    // Matches real usage — an attribute (`data-i18n-html=`) or a selector
    // (`[data-i18n-html]`) — so prose explaining why it was removed is allowed.
    const offenders = SOURCE_FILES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return src.includes('data-i18n-html=') || src.includes('[data-i18n-html]');
    }).map((f) => relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('the i18n engine assigns no innerHTML', () => {
    const src = readFileSync(resolve(ROOT, 'public/js/i18n.js'), 'utf8');
    expect(src).not.toMatch(/\.innerHTML\s*=/);
  });

  it('the only set:html in src/**/*.astro is the escaped JSON island', () => {
    // kalender.astro embeds an application/json <script>, escaping <, > and &
    // before they reach the page — a data island, not rendered markup. Any new
    // set:html is a deliberate decision that must be argued for here.
    //
    // faq.astro (added 2026-08-13) is the second and applies the identical escaping to
    // an application/ld+json FAQPage island. The argument: structured data has to be
    // ONE serialized blob, so there is no element-per-value form to fall back on, and
    // its content is the same dictionary strings the page already renders — built from
    // the same keys precisely so the markup and the structured data cannot disagree.
    // The \uXXXX escaping is what makes it a data island rather than an HTML sink.
    const offenders = walk(resolve(ROOT, 'src'), ['.astro'])
      .filter((f) => readFileSync(f, 'utf8').includes('set:html'))
      .map((f) => relative(ROOT, f));

    expect(offenders).toEqual([
      join('src', 'pages', 'weiteres', 'faq.astro'),
      join('src', 'pages', 'weiteres', 'kalender.astro'),
    ]);
  });
});

describe('committed dictionaries carry no markup', () => {
  for (const { lang, path, values } of DICTIONARIES) {
    it(`${path} has no value containing "<"`, () => {
      const offenders = Object.entries(values)
        .filter(([, v]) => typeof v === 'string' && v.includes('<'))
        .map(([k]) => k);

      expect(offenders).toEqual([]);
    });

    it(`${path} has no empty value`, () => {
      const empty = Object.entries(values)
        .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
        .map(([k]) => k);

      expect(empty).toEqual([]);
    });

    it(`${path} is flat — no nested objects`, () => {
      const nested = Object.entries(values)
        .filter(([, v]) => typeof v === 'object' && v !== null)
        .map(([k]) => k);

      expect(nested).toEqual([]);
      expect(lang).toMatch(/^(de|en)$/);
    });
  }

  it('DE and EN hold exactly the same keys', () => {
    const [de, en] = DICTIONARIES;
    const deKeys = Object.keys(de.values).sort();
    const enKeys = Object.keys(en.values).sort();

    expect(deKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !deKeys.includes(k))).toEqual([]);
    expect(deKeys.length).toBe(enKeys.length);
  });
});
