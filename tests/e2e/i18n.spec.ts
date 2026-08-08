import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';

// Single-URL site: one canonical path per page, language chosen client-side.
// These specs used to assert on /de/… vs /en/… URLs; that scheme is gone, so
// they now drive the real mechanism — the stored choice and the header toggle.
//
// Expected copy comes from the DICTIONARIES, never from literals. What these
// specs verify is that the page renders the *right locale's* value — not that
// the club still describes itself with a particular sentence. Once these keys
// are editable from /admin, a literal here would turn CI red on an ordinary
// content edit, which is both wrong and the hardest kind of red to diagnose.
test.describe('i18n - locale correctness', () => {
  test('a stored DE choice renders the page in German', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator(`text=${de.homeSubtitle}`).first()).toBeVisible();
  });

  test('a stored EN choice renders the same URL in English', async ({ page }) => {
    await gotoWithLang(page, '/', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator(`text=${en.homeSubtitle}`).first()).toBeVisible();
  });

  test('nav labels follow the language', async ({ page }) => {
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('nav').getByText(de.navAbout, { exact: true }).first()).toBeAttached();

    await gotoWithLang(page, '/', 'en');
    await expect(page.locator('nav').getByText(en.navAbout, { exact: true }).first()).toBeAttached();
  });

  test('page content is not a mix of both languages', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await expect(page.locator('h1')).toContainText(de.aboutTitle);

    await gotoWithLang(page, '/club/ueber-uns', 'en');
    await expect(page.locator('h1')).toContainText(en.aboutTitle);
  });

  test('the language choice survives a reload and a navigation', async ({ page }) => {
    await gotoWithLang(page, '/', 'en');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto('/club/ueber-uns');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText(en.aboutTitle);
  });

  test('the header toggle switches language in place, without changing the URL', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await expect(page.locator('h1')).toContainText(de.aboutTitle);

    await switchLangTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText(en.aboutTitle);
    await expect(page).toHaveURL(/\/club\/ueber-uns\/?$/); // same URL — no /en/ prefix

    await switchLangTo(page, 'de');
    await expect(page.locator('h1')).toContainText(de.aboutTitle);
    await expect(page).toHaveURL(/\/club\/ueber-uns\/?$/);
  });
});
