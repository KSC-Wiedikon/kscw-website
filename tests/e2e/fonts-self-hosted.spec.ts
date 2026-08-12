/**
 * Inter is served from this origin, not from Google.
 *
 * It used to be a `<link>` to fonts.googleapis.com, which is two cross-origin round
 * trips in series — the stylesheet, then the font it names — so every cold load
 * painted in the system sans and re-laid-out the page when Inter arrived. That was
 * the one staged repaint German visitors saw as well, since it has nothing to do
 * with language.
 *
 * /admin is deliberately excluded: it has its own <head>, does not load global.css,
 * and is a private tool where a font repaint costs nothing. The CSP still allows the
 * Google hosts for exactly that reason.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

const PAGES = ['/', '/volleyball', '/basketball/teams/nachwuchs', '/club/feedback'];

test.describe('self-hosted Inter', () => {
  for (const path of PAGES) {
    test(`${path} asks Google for nothing`, async ({ page }) => {
      const offsite: string[] = [];
      page.on('request', (r) => {
        if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) offsite.push(r.url());
      });

      await gotoWithLang(page, path, 'de');
      expect(offsite, 'a Google Fonts request is back').toEqual([]);
    });
  }

  test('the real font is actually applied, not just declared', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        interReady: document.fonts.check('600 16px Inter'),
        family: getComputedStyle(document.body).fontFamily,
      };
    });

    expect(state.interReady, 'Inter never loaded — the page is on a fallback').toBe(true);
    // The metric-matched stand-in must stay in the stack, between Inter and the
    // generic, or first paint reflows when Inter arrives.
    expect(state.family).toContain('Inter Fallback');
  });

  test('only the latin subset is fetched on a page that needs no extended glyphs', async ({ page }) => {
    const fonts: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/fonts/')) fonts.push(r.url().split('/').pop()!);
    });

    await gotoWithLang(page, '/', 'de');
    await page.evaluate(() => document.fonts.ready);

    expect(fonts, 'the latin subset was not fetched').toContain('inter-latin.woff2');
    // latin-ext is 85 KB and gated by unicode-range; the homepage has no glyph in it.
    expect(fonts, 'latin-ext was fetched unnecessarily').not.toContain('inter-latin-ext.woff2');
  });

  test('the font is preloaded so it is not discovered late', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    const preload = page.locator('link[rel="preload"][as="font"]');
    await expect(preload).toHaveCount(1);
    expect(await preload.getAttribute('href')).toBe('/fonts/inter-latin.woff2');
    // Fonts are opaque-origin fetches; without crossorigin the preload is discarded
    // and fetched a second time.
    expect(await preload.getAttribute('crossorigin')).not.toBeNull();
  });
});
