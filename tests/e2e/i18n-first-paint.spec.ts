/**
 * The German→English flash.
 *
 * Every page is server-rendered in German and swapped to English in the browser, so
 * for an English visitor there is a window in which the wrong language is on screen.
 * It used to be enormous: the dictionary request — the only thing that can end that
 * window — was issued from a DOMContentLoaded handler, which put it behind the whole
 * document including a 398 KB parser-blocking icon bundle. Measured at 150 ms RTT /
 * 4× CPU, a complete German page stayed readable for 1.65–2.67 s.
 *
 * The request now goes out from the inline pre-paint script at the top of <head>,
 * which needs no download of its own, and is handed to public/js/i18n.js via
 * window.__I18N_PRE. What is left is one round trip.
 *
 * These tests pin the ORDERING, which is what actually decayed — a timing budget
 * would be flaky on CI hardware. The one perceptual test below is deliberately
 * generous for the same reason.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

interface Timings {
  dictStart: number | null;
  dictEnd: number | null;
  dcl: number;
  fcp: number | null;
}

const timings = (page: import('@playwright/test').Page, lang: string) =>
  page.evaluate((l): Timings => {
    const dict = performance.getEntriesByType('resource')
      .find((r) => r.name.includes(`/js/i18n/${l}.json`)) as PerformanceResourceTiming | undefined;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
    return {
      dictStart: dict ? dict.startTime : null,
      dictEnd: dict ? dict.responseEnd : null,
      dcl: nav.domContentLoadedEventStart,
      fcp: paint ? paint.startTime : null,
    };
  }, lang);

test.describe('i18n first paint', () => {
  test('the dictionary is requested long before DOMContentLoaded', async ({ page }) => {
    await gotoWithLang(page, '/', 'en');
    const t = await timings(page, 'en');

    expect(t.dictStart, 'no request for en.json was recorded').not.toBeNull();
    // The regression this guards: it used to fire 1-2 ms AFTER dcl, every time.
    expect(t.dictStart!).toBeLessThan(t.dcl);
  });

  test('German visitors get their dictionary just as early', async ({ page }) => {
    // German needs it too — window.i18n.t() serves the runtime strings from it.
    await gotoWithLang(page, '/', 'de');
    const t = await timings(page, 'de');

    expect(t.dictStart).not.toBeNull();
    expect(t.dictStart!).toBeLessThan(t.dcl);
  });

  test('the pre-paint script hands its request to the engine instead of duplicating it', async ({ page }) => {
    // NOT gotoWithLang: that navigates twice by design (once to establish the
    // origin, once with the language stored), so it would count two loads' worth
    // of requests. Seed via an init script and navigate exactly once.
    await page.addInitScript(() => {
      try { localStorage.setItem('kscw-locale', 'en'); } catch { /* private mode */ }
    });
    const dictRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/js/i18n/en.json')) dictRequests.push(r.url());
    });

    await page.goto('/basketball/teams/nachwuchs');
    await page.waitForFunction(() => 'i18nReady' in window);
    await page.evaluate(() => (window as unknown as { i18nReady: Promise<string> }).i18nReady);

    // One request, not two: i18n.js must consume window.__I18N_PRE rather than
    // issue its own. Two would mean the hand-off broke and the saving is gone.
    expect(dictRequests).toHaveLength(1);
  });

  test('the heavy scripts are async so they cannot gate DOMContentLoaded', async ({ page }) => {
    // Asserted structurally, not by timing: on a warm localhost both finish in
    // ~20 ms, so a duration comparison proves nothing and flakes on CI hardware.
    // The attribute IS the invariant — 398 KB of icons and a third-party CDN must
    // never be parser-blocking again.
    await gotoWithLang(page, '/', 'de');

    for (const src of ['lucide', 'sentry-cdn']) {
      const tag = page.locator(`script[src*="${src}"]`).first();
      await expect(tag, `${src} must still be on the page`).toHaveCount(1);
      expect(await tag.getAttribute('async'), `${src} is not async`).not.toBeNull();
    }
  });

  test('icons still render even though their bundle is async', async ({ page }) => {
    // The cost of Fix 3: createIcons() now runs after DOMContentLoaded, so this is
    // the assertion that the guard for "bundle landed mid-parse" actually works.
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('footer svg').first()).toBeVisible();
    // lucide swaps each <i data-lucide="…"> for an <svg> — and CARRIES THE ATTRIBUTE
    // OVER, so counting [data-lucide] proves nothing. A leftover <i> is the real
    // signal that createIcons() never ran.
    await expect.poll(
      () => page.locator('footer i[data-lucide]').count(),
      { message: 'lucide placeholders were never replaced' },
    ).toBe(0);
    await expect(page.locator('footer svg[data-lucide="instagram"]')).toHaveCount(1);
  });

  test('no German text survives on screen once the page has settled', async ({ page }) => {
    await gotoWithLang(page, '/basketball/teams/nachwuchs', 'en');

    // The whole point: the swap happened, and it happened everywhere.
    await expect(page.locator('[data-i18n="bbYouthSubtitle"]').first())
      .toHaveText('All youth teams at a glance — from U8 to U18');
    await expect(page.locator('[data-i18n="navAbout"]').first()).toHaveText('About us');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('a dictionary that never arrives leaves a consistent German page', async ({ page }) => {
    // Not a mixed one: <html lang> must go back to de, or the CSS-switched
    // [data-lang-only] blocks show their English half over German text.
    await page.route('**/js/i18n/en.json*', (route) => route.abort('failed'));
    await gotoWithLang(page, '/club/feedback', 'en');
    await page.waitForFunction(() => 'i18nReady' in window);
    await page.evaluate(() => (window as unknown as { i18nReady: Promise<string> }).i18nReady);

    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    await expect(page.locator('[data-lang-only="de"]').first()).toBeVisible();
    await expect(page.locator('[data-lang-only="en"]').first()).toBeHidden();
  });
});
