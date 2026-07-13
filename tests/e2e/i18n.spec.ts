import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

// Single-URL site: one canonical path per page, language chosen client-side.
// These specs used to assert on /de/… vs /en/… URLs; that scheme is gone, so
// they now drive the real mechanism — the stored choice and the header toggle.
test.describe('i18n - locale correctness', () => {
  test('a stored DE choice renders the page in German', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('text=Basketball und Volleyball seit 1982').first()).toBeVisible();
  });

  test('a stored EN choice renders the same URL in English', async ({ page }) => {
    await gotoWithLang(page, '/', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('text=Basketball and Volleyball since 1982').first()).toBeVisible();
  });

  test('nav labels follow the language', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('nav').getByText('Über uns', { exact: true }).first()).toBeAttached();

    await gotoWithLang(page, '/', 'en');
    await expect(page.locator('nav').getByText('About us', { exact: true }).first()).toBeAttached();
  });

  test('page content is not a mix of both languages', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await expect(page.locator('h1')).toContainText('Über uns');

    await gotoWithLang(page, '/club/ueber-uns', 'en');
    await expect(page.locator('h1')).toContainText('About us');
  });

  test('the language choice survives a reload and a navigation', async ({ page }) => {
    await gotoWithLang(page, '/', 'en');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto('/club/ueber-uns');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('About us');
  });

  test('the header toggle switches language in place, without changing the URL', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await expect(page.locator('h1')).toContainText('Über uns');

    await switchLangTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('About us');
    await expect(page).toHaveURL(/\/club\/ueber-uns\/?$/); // same URL — no /en/ prefix

    await switchLangTo(page, 'de');
    await expect(page.locator('h1')).toContainText('Über uns');
    await expect(page).toHaveURL(/\/club\/ueber-uns\/?$/);
  });
});
