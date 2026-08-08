import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo, type Lang } from './helpers';

// Canonical single-URL paths, each exercised in the language it used to be
// covered in when the site still had /de/ and /en/ prefixes.
const samplePages: Array<[string, Lang]> = [
  ['/', 'de'],
  ['/', 'en'],
  ['/club/ueber-uns', 'de'],
  ['/club/ueber-uns', 'en'],
  ['/volleyball/', 'de'],
  ['/volleyball/', 'en'],
  ['/basketball/', 'de'],
  ['/basketball/', 'en'],
  ['/weiteres/kalender', 'de'],
  ['/sponsoren/', 'de'],
];

test.describe('navigation - link validation', () => {
  for (const [pagePath, lang] of samplePages) {
    test(`no dead internal links on ${pagePath} [${lang}]`, async ({ page }) => {
      await gotoWithLang(page, pagePath, lang);

      const links = await page.$$eval('a[href]', (anchors) =>
        anchors
          .map((a) => a.getAttribute('href'))
          .filter((href): href is string => !!href)
          .filter((href) => href.startsWith('/') && !href.startsWith('//'))
          .filter((href) => !href.includes('#'))
      );

      const uniqueLinks = [...new Set(links)];

      for (const link of uniqueLinks) {
        const response = await page.request.get(link);
        expect(response.status(), `Dead link: ${link} on page ${pagePath}`).toBeLessThan(400);
      }
    });
  }
});

test.describe('navigation - language switcher', () => {
  // The switcher is a button that swaps the text in place — not a link to a
  // parallel URL tree — so assert on the rendered language, not on the URL.
  test('DE page switches to EN', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await switchLangTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('About us');
  });

  test('EN page switches to DE', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'en');
    await switchLangTo(page, 'de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('h1')).toContainText('Über uns');
  });

  test('the chosen language is remembered on the next page', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    await switchLangTo(page, 'en');

    await page.goto('/club/ueber-uns');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('navigation - desktop nav', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('main nav links are visible and clickable', async ({ page }) => {
    await gotoWithLang(page, '/');
    const nav = page.locator('.site-header nav');
    await expect(nav).toBeVisible();
    const navLink = page.locator('.nav-link').first();
    await expect(navLink).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await gotoWithLang(page, '/');
    await page.goto('/club/ueber-uns');
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/club\/ueber-uns/);
  });

  test('footer links work', async ({ page }) => {
    await gotoWithLang(page, '/');
    const footerLinks = page.locator('footer a[href^="/"]');
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);
    const href = await footerLinks.first().getAttribute('href');
    if (href) {
      const response = await page.request.get(href);
      expect(response.status()).toBeLessThan(400);
    }
  });
});

test.describe('navigation - mobile nav', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger opens mobile nav', async ({ page }) => {
    await gotoWithLang(page, '/');
    const hamburger = page.locator('.nav-hamburger');
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(page.locator('body')).toHaveClass(/nav-open/);
  });

  test('mobile nav links are clickable', async ({ page }) => {
    await gotoWithLang(page, '/');
    await page.locator('.nav-hamburger').click();
    await expect(page.locator('body')).toHaveClass(/nav-open/);
    const mobileLinks = page.locator('.mobile-nav a[href^="/"]');
    const count = await mobileLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('mobile nav closes on link click', async ({ page }) => {
    await gotoWithLang(page, '/');
    await page.locator('.nav-hamburger').click();
    await expect(page.locator('body')).toHaveClass(/nav-open/);
    const directLink = page.locator('.mobile-nav a[href^="/"]').first();
    const href = await directLink.getAttribute('href');
    // The click closes the menu AND navigates. Wait for the navigation to
    // settle before asserting — otherwise the class check races the teardown of
    // the page being left, which fails only under parallel load.
    await Promise.all([page.waitForURL(`**${href}`), directLink.click()]);
    await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  });
});
