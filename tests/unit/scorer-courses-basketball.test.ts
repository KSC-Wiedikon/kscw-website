import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';
import searchIndex from '../../src/data/search-pages.json';

const root = resolve(__dirname, '../..');
const page = readFileSync(resolve(root, 'src/pages/weiteres/schreiberkurse-basketball.astro'), 'utf-8');
const header = readFileSync(resolve(root, 'src/components/Header.astro'), 'utf-8');
const footer = readFileSync(resolve(root, 'src/components/Footer.astro'), 'utf-8');

const deDict = de as Record<string, string>;
const enDict = en as Record<string, string>;

const PATH = '/weiteres/schreiberkurse-basketball';

/**
 * Most of this page's copy is reached through a *variable* — `data-i18n={doc.key}`,
 * `data-i18n={group.titleKey}` — so scanning for literal `data-i18n="…"` would check
 * barely a third of it and pass while the document titles rendered as raw key names.
 * The frontmatter tables are therefore scraped too.
 */
function keysUsedOnPage(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) found.add(m[1]);
  for (const m of src.matchAll(/\b(?:key|titleKey|descKey):\s*'([A-Za-z0-9_]+)'/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bt\(locale,\s*'([A-Za-z0-9_]+)'\)/g)) found.add(m[1]);
  for (const m of src.matchAll(
    /\b(?:titleKey|descriptionKey|pageTitleKey|pageSubtitleKey)="([A-Za-z0-9_]+)"/g,
  )) found.add(m[1]);
  return [...found];
}

/** The `{ folder, file, type, stand }` document rows declared in the frontmatter. */
function docsOnPage(src: string) {
  return [...src.matchAll(
    /\{\s*key:\s*'([A-Za-z0-9_]+)',\s*folder:\s*'([^']*)',\s*file:\s*'([^']+)',\s*type:\s*'(PDF|PPTX)',\s*stand:\s*'([^']+)'/g,
  )].map((m) => ({ key: m[1], folder: m[2], file: m[3], type: m[4], stand: m[5] }));
}

describe('basketball scorer courses — i18n wiring', () => {
  // i18n.t() returns the key itself on a miss, so a missing entry doesn't throw — it
  // renders "bbScorerDocFiba" into the page as if it were a document title.
  it('every i18n key the page references exists in both dictionaries', () => {
    const used = keysUsedOnPage(page);
    expect(used.length).toBeGreaterThan(40); // guard against the regexes matching nothing
    expect(used.filter((k) => !(k in deDict))).toEqual([]);
    expect(used.filter((k) => !(k in enDict))).toEqual([]);
  });

  it('the nav and footer labels are translated in both languages', () => {
    for (const k of ['navScorerCoursesBasketball', 'footerScorerCoursesBasketball']) {
      expect(deDict[k]).toBeTruthy();
      expect(enDict[k]).toBeTruthy();
      expect(deDict[k]).not.toBe(enDict[k]);
    }
  });
});

describe('basketball scorer courses — ProBasket documents', () => {
  const docs = docsOnPage(page);

  it('lists every document from the ProBasket share', () => {
    // 3 basics + 4 digital scoresheet + 5 cheat sheets + 7 training modules.
    expect(docs).toHaveLength(19);
  });

  it('gives each document its own i18n key and its own file', () => {
    expect(new Set(docs.map((d) => d.key)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => `${d.folder}/${d.file}`)).size).toBe(docs.length);
  });

  // CLAUDE.md: every date on this site renders dd.mm.yyyy. ProBasket only dates some
  // documents to the year, which is why a bare yyyy is allowed — an ISO 2026-07-09
  // slipping in is not.
  it('states each version as dd.mm.yyyy or a bare year', () => {
    const bad = docs.filter((d) => !/^(\d{2}\.\d{2}\.\d{4}|\d{4})$/.test(d.stand));
    expect(bad.map((d) => `${d.key}: ${d.stand}`)).toEqual([]);
  });

  // The links are built by percent-encoding folder and filename into a Nextcloud
  // `?path=…&files=…` query. Hand-writing a URL instead would skip the encoding and
  // silently 404 on the eight filenames carrying a space, a '+' or an umlaut.
  it('builds download URLs through the encoding helper, never inline', () => {
    expect(page).toContain('function docUrl(');
    expect(page).toMatch(/encodeURIComponent\(path\)/);
    expect(page).toMatch(/encodeURIComponent\(file\)/);
    // No hardcoded /download? link anywhere in the markup.
    expect(page).not.toMatch(/href="https:\/\/cloud\.probasket\.ch[^"]*\/download\?/);
  });

  it('keeps ProBasket filenames verbatim, including their typo', () => {
    // ProBasket's own file is misspelled "Learingtool"; "fixing" it 404s the link.
    expect(docs.some((d) => d.file === 'Learingtool Registrieren.pdf')).toBe(true);
  });
});

describe('basketball scorer courses — the page is reachable', () => {
  it('is linked from the desktop nav, the mobile nav and the footer', () => {
    expect(header.match(new RegExp(`l\\('${PATH}'\\)`, 'g'))).toHaveLength(2);
    expect(footer).toContain(`l('${PATH}')`);
  });

  it('is in the search index', () => {
    const entry = (searchIndex as { url: string; titleKey: string; descKey: string }[])
      .find((e) => e.url === PATH);
    expect(entry).toBeDefined();
    expect(entry!.titleKey in deDict).toBe(true);
    expect(entry!.descKey in deDict).toBe(true);
  });

  it('cross-links to the volleyball scorer page', () => {
    expect(page).toContain('href="/weiteres/schreiberkurse"');
  });
});
