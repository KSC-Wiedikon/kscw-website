import { test, expect } from '@playwright/test';
import { gotoWithLang, type Lang } from './helpers';

// Canonical single-URL paths. The home page is checked in both languages —
// English swaps longer strings in client-side, which is exactly where a layout
// overflow would show up (that was the point of the old '/en/' entry).
const pagesToCheck: Array<[string, Lang]> = [
  ['/', 'de'],
  ['/', 'en'],
  ['/club/ueber-uns', 'de'],
  ['/volleyball/', 'de'],
  ['/basketball/', 'de'],
  ['/weiteres/kalender', 'de'],
  ['/sponsoren/', 'de'],
  ['/weiteres/mitgliedschaft', 'de'],
  ['/club/kontakt', 'de'],
  ['/club/feedback', 'de'],
];

test.describe('layout - no horizontal overflow', () => {
  for (const [pagePath, lang] of pagesToCheck) {
    test(`no horizontal scrollbar on ${pagePath} [${lang}]`, async ({ page }) => {
      await gotoWithLang(page, pagePath, lang);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasOverflow, `Horizontal overflow on ${pagePath}`).toBe(false);
    });
  }
});

test.describe('layout - header and footer', () => {
  for (const [pagePath, lang] of pagesToCheck) {
    test(`header and footer visible on ${pagePath} [${lang}]`, async ({ page }) => {
      await gotoWithLang(page, pagePath, lang);
      await expect(page.locator('.site-header')).toBeVisible();
      await expect(page.locator('footer')).toBeVisible();
    });
  }
});

test.describe('layout - images', () => {
  for (const pagePath of ['/', '/club/ueber-uns', '/sponsoren/']) {
    test(`images have alt text and load on ${pagePath}`, async ({ page }) => {
      await gotoWithLang(page, pagePath);

      const images = page.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const src = await img.getAttribute('src');
        expect(alt, `Image missing alt: ${src}`).not.toBeNull();

        // Skip PocketBase API images (relative /api/files/ URLs don't resolve in test env)
        if (src && src.startsWith('/api/')) continue;
        // Skip external Directus assets (network-dependent, may fail in CI)
        if (src && src.includes('directus.kscw.ch')) continue;

        const loaded = await img.evaluate((el: HTMLImageElement) => el.naturalWidth > 0);
        expect(loaded, `Image failed to load: ${src}`).toBe(true);
      }
    });
  }
});
