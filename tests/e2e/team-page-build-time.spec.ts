/**
 * Team detail pages ship a real hero, not an empty box.
 *
 * They used to render nothing at all server-side: two empty containers plus five
 * "wird geladen" placeholders, with the entire page drawn by public/js/team-page.js
 * after a Directus round trip. That contradicted the hybrid instant-paint contract
 * the rest of the site keeps, and it cost a measured CLS of 0.619 on /volleyball/hu20
 * and 0.91-0.95 on /volleyball/h1 — both "poor", the worst numbers on the site —
 * because the hero and the 1280 px photo dropped in under the reader.
 *
 * Now the hero and photo are built by src/components/TeamHero.astro and
 * TeamPhoto.astro, and team-page.js REPLACES the hero rather than appending to it.
 * After: 0.0019 / 0.092 / 0.002.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

const PAGES = ['/volleyball/h1', '/volleyball/hu20', '/basketball/h1'];

test.describe('the hero is in the HTML', () => {
  for (const path of PAGES) {
    test(`${path} names its team before any JS runs`, async ({ browser }) => {
      // A context with JS off can only ever see the build output.
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(path);

      const h1 = page.locator('#team-hero-container .team-hero h1');
      await expect(h1).toBeVisible();
      await expect(h1).toContainText('KSC Wiedikon');
      // The league line too — an empty hero with just a title would still shift.
      await expect(page.locator('#team-hero-container .team-league').first()).not.toBeEmpty();
      await ctx.close();
    });
  }

  test('the youth hero carries its eligible Jahrgänge without JS', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/volleyball/hu20');

    const line = page.locator('#team-hero-container .birth-years');
    await expect(line).toContainText('Jahrgang:');
    await expect(line).toContainText('und jünger');
    await ctx.close();
  });
});

test.describe('the client render swaps in, it does not stack', () => {
  for (const path of PAGES) {
    test(`${path} ends up with exactly one hero`, async ({ page }) => {
      await gotoWithLang(page, path, 'de');
      // Wait for the live render to have happened at all.
      await expect(page.locator('[data-tab="kader"]')).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(1500);

      // renderHero() used to append. Two heroes is the regression this catches.
      await expect(page.locator('.team-hero')).toHaveCount(1);
      // Not every team has a photo, so the invariant is "never doubled" rather than
      // an exact count — renderTeamPhoto()'s own guard is what enforces it.
      expect(await page.locator('.team-photo').count()).toBeLessThanOrEqual(1);
      await expect(page.locator('.team-hero h1')).toContainText('KSC Wiedikon');
    });
  }

  test('a language toggle does not stack a second hero either', async ({ page }) => {
    await gotoWithLang(page, '/volleyball/h1', 'de');
    await expect(page.locator('.team-hero h1')).toBeVisible({ timeout: 25_000 });

    const toggle = page.locator('.lang-btn[data-lang="en"]').first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await toggle.click();   // two fast clicks: the case that used to race
      await page.waitForTimeout(1500);
      await expect(page.locator('.team-hero')).toHaveCount(1);
    }
  });
});

test.describe('layout stability', () => {
  for (const path of PAGES) {
    test(`${path} stays inside the "good" CLS budget`, async ({ page }) => {
      await page.addInitScript(`
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      `);
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(3000);

      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      // 0.1 is the Core Web Vitals "good" threshold. Measured 0.0019-0.092 here,
      // against 0.6-0.95 before the hero was pre-rendered.
      expect(cls, `CLS on ${path}`).toBeLessThan(0.1);
    });
  }
});
