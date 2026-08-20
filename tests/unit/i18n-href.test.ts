/**
 * Guards the one translated value that is **not** inert: `data-i18n-href`.
 *
 * Every other target the i18n engine writes to — textContent, `alt`, `title`,
 * `placeholder`, `aria-label` — is harmless whatever the dictionary says. An
 * `href` is not. Dictionary values are admin-editable through Seitentexte and
 * `script-src` still carries 'unsafe-inline' (SECURITY.md defers that on the
 * grounds that the stored-XSS sinks are closed), so a `javascript:` value would
 * execute on click — the sponsor `website_url` hole, arriving by a second route.
 *
 * These are source-level assertions because the failure mode is a *missing*
 * call: someone adds a second href path, or "simplifies" applyHref() into a
 * plain setAttribute, and nothing about the page looks different in review. The
 * behaviour of the guard itself is covered by safe-href.test.ts (72 cases
 * through both implementations); what is pinned here is that the href path
 * cannot bypass it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';
import { safeHref } from '../../src/lib/safeHref';

const ROOT = process.cwd();
const engine = readFileSync(resolve(ROOT, 'public/js/i18n.js'), 'utf8');

const dicts: Record<string, Record<string, string>> = {
  de: de as Record<string, string>,
  en: en as Record<string, string>,
};

/** Keys wired to an href somewhere in the page sources. */
const URL_KEYS = ['scorerCoursesPdfUrl', 'scorerCoursesPptUrl'];

describe('i18n href path', () => {
  it('routes every href write through the scheme allowlist', () => {
    // Exactly one place may touch an href, and it must consult kscwSafeHref.
    const writes = engine.match(/setAttribute\(\s*'href'/g) ?? [];
    expect(writes).toHaveLength(1);

    const applyHref = engine.match(/function applyHref\([\s\S]*?\n  \}/)?.[0];
    expect(applyHref).toBeTruthy();
    expect(applyHref).toContain('kscwSafeHref');
    expect(applyHref).toContain("setAttribute('href'");
  });

  it('fails closed when the value is rejected', () => {
    // A rejected value must leave the element with no href, never with the
    // previous one silently kept and never with the unvetted string.
    const applyHref = engine.match(/function applyHref\([\s\S]*?\n  \}/)![0];
    expect(applyHref).toContain("removeAttribute('href')");
  });

  it('treats a missing guard as a rejection, not as permission', () => {
    // safe-href.js loads render-blocking from BaseLayout's <head>; if that ever
    // breaks, the link must disappear rather than take the raw dictionary value.
    const applyHref = engine.match(/function applyHref\([\s\S]*?\n  \}/)![0];
    expect(applyHref).toMatch(/typeof window\.kscwSafeHref === 'function'/);
  });

  it('vets overrides too, not just the load-time pass', () => {
    // applyOverrides() re-renders overridden keys through ATTR_TARGETS. An
    // admin edit is precisely the case the guard exists for, so the href entry
    // has to be marked as a URL there rather than falling into setAttribute.
    expect(engine).toMatch(/\['data-i18n-href', 'href', true\]/);
    expect(engine).toMatch(/if \(isUrl\) applyHref\(/);
  });
});

describe('scorer course deck URLs', () => {
  it('defines every URL key in both dictionaries', () => {
    for (const key of URL_KEYS) {
      for (const lang of ['de', 'en']) {
        expect(dicts[lang][key], `${key} missing from ${lang}.json`).toBeTruthy();
      }
    }
  });

  it('ships values the guard accepts', () => {
    // A committed value that fails safeHref would render a button with no href
    // at all — the fail-closed branch turning a typo into a dead link.
    for (const key of URL_KEYS) {
      for (const lang of ['de', 'en']) {
        const value = dicts[lang][key];
        expect(safeHref(value), `${lang}.${key} is not a safe href`).toBe(value);
        expect(value).toMatch(/^https:\/\//);
      }
    }
  });

  it('wires both deck buttons to a key rather than a literal URL', () => {
    // The German page renders at build time and English is swapped in the
    // browser: a hardcoded href would leave English visitors on the German
    // deck, which is the whole reason these keys exist.
    const page = readFileSync(resolve(ROOT, 'src/pages/weiteres/schreiberkurse.astro'), 'utf8');
    for (const key of URL_KEYS) {
      expect(page).toContain(`data-i18n-href="${key}"`);
      expect(page).toContain(`safeHref(t(locale, '${key}'))`);
    }
  });
});
