/**
 * The scorer-course deck links are language-dependent, which on a single-URL
 * site means the href has to be swapped in the browser like any other string.
 *
 * German renders at build time and English is patched in by public/js/i18n.js,
 * so a hardcoded href would send every English visitor to the German deck (and
 * vice versa) with nothing on screen to suggest it: the button text translates
 * perfectly well while pointing at the wrong file. That is what these assert —
 * the href follows the dictionary, on load AND after a toggle with no reload.
 *
 * They compare against the dictionary rather than a literal URL so they keep
 * their meaning when the German deck gets its own file: the day de.json and
 * en.json diverge is the day this starts testing a real difference, with no
 * edit needed here.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gotoWithLang, switchLangTo } from './helpers';

const dict = (lang: 'de' | 'en'): Record<string, string> =>
  JSON.parse(readFileSync(resolve(process.cwd(), `public/js/i18n/${lang}.json`), 'utf8'));

const PPT = '[data-i18n-href="scorerCoursesPptUrl"]';
const PDF = '[data-i18n-href="scorerCoursesPdfUrl"]';

test.describe('scorer course deck links', () => {
  for (const lang of ['de', 'en'] as const) {
    test(`point at the ${lang.toUpperCase()} files in ${lang.toUpperCase()}`, async ({ page }) => {
      await gotoWithLang(page, '/weiteres/schreiberkurse', lang);
      const strings = dict(lang);

      await expect(page.locator(PPT)).toHaveAttribute('href', strings.scorerCoursesPptUrl);
      await expect(page.locator(PDF)).toHaveAttribute('href', strings.scorerCoursesPdfUrl);
    });
  }

  test('the href follows a language toggle, not just a reload', async ({ page }) => {
    // applyTranslations() runs again on langChanged; if the href path were
    // load-time only, a visitor who switched language mid-page would keep the
    // other language's deck.
    await gotoWithLang(page, '/weiteres/schreiberkurse', 'de');
    await switchLangTo(page, 'en');

    await expect(page.locator(PPT)).toHaveAttribute('href', dict('en').scorerCoursesPptUrl);
  });

  test('never render a button with a dangerous or empty href', async ({ page }) => {
    // The guard fails closed, so a rejected value removes the attribute. Either
    // outcome is safe; a link that is present must be http(s).
    await gotoWithLang(page, '/weiteres/schreiberkurse', 'de');

    const hrefs = await page.locator('[data-i18n-href]').evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute('href')),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  });
});
