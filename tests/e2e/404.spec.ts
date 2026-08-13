import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo, waitForI18n } from './helpers';

/**
 * The custom 404.
 *
 * What this pins is the *status code* as much as the page. Before `src/pages/404.astro`
 * existed, Cloudflare Pages fell back to `index.html` for any unmatched path, so an
 * unknown URL answered **200 with a byte-identical copy of the homepage** — a soft 404.
 * A test that only checked for the words "not found" would have passed just as happily
 * against a page that quietly served the homepage, so the status assertion is the point.
 *
 * `astro preview` implements the same static-host contract (serve `404.html` with a 404
 * status for an unmatched path), which is what makes this testable without deploying.
 */

const UNKNOWN = '/diese-seite-gibt-es-nicht';

test('an unknown path answers 404, not 200', async ({ page }) => {
  const response = await page.goto(UNKNOWN);
  expect(response?.status()).toBe(404);
});

test('a retired team slug gets the 404 page, not the homepage', async ({ page }) => {
  // The concrete regression: team slugs are retired at the June season rollover, and
  // /volleyball/du23-2 was live until then. It used to answer 200 + homepage.
  const response = await page.goto('/volleyball/du23-2');
  expect(response?.status()).toBe(404);

  await waitForI18n(page);
  // The homepage hero must NOT be what a visitor sees here.
  await expect(page.locator('h1')).toHaveText(/nicht gefunden|not found/i);
});

test('renders the German not-found page with a way onward', async ({ page }) => {
  await gotoWithLang(page, UNKNOWN, 'de');

  await expect(page.locator('h1')).toHaveText('Seite nicht gefunden');
  // A dead end with no links is the failure mode this page exists to prevent.
  const links = page.locator('.notfound-card');
  await expect(links).toHaveCount(4);
  await expect(page.locator('.notfound-card[href="/volleyball"]')).toBeVisible();
  await expect(page.locator('.notfound-card[href="/club/kontakt"]')).toBeVisible();
});

test('translates to English like every other page', async ({ page }) => {
  // The page is built in German and swapped client-side; a hardcoded German literal
  // would render correctly today and stay German forever for an English visitor.
  await gotoWithLang(page, UNKNOWN, 'de');
  await switchLangTo(page, 'en');

  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('.notfound-card[href="/volleyball"] p')).toContainText('volleyball team');
});

test('the links actually resolve', async ({ page }) => {
  await gotoWithLang(page, UNKNOWN, 'de');

  const hrefs = await page.locator('.notfound-card').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href')!),
  );

  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), `${href} should not itself 404`).toBe(200);
  }
});
