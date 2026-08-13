import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

/**
 * Header search.
 *
 * The index listed **no team page at all** — searching the club's own team names
 * returned nothing, on the pages most search traffic lands on. It is now generated at
 * build time (`src/pages/search-index.json.ts`) from the same live team source the nav
 * uses, with the curated static pages kept by hand in `src/data/search-pages.json`.
 *
 * The subtle half is why this file exists rather than a unit test on the JSON: adding
 * team entries alone would have been a **silent no-op**. `search.js` built each entry's
 * haystack purely from `dicts[lang][titleKey]`, and a team's title ("D1") is a data
 * value, not a dictionary key — so every lookup returned undefined, the haystack came
 * out empty, and the entry matched nothing while still rendering correctly in the
 * results list. Only an end-to-end query proves the fix; inspecting the JSON does not.
 */

async function searchFor(page: Page, query: string): Promise<string[]> {
  const overlay = page.locator('#site-search');
  if ((await overlay.getAttribute('aria-hidden')) !== 'false') {
    // Two openers exist and the viewport picks one. `.search-btn` sits in the desktop
    // nav; below 900px it is `display: none` and `.mobile-search-btn` takes over — but
    // that one lives INSIDE the collapsed hamburger menu (`#mobile-nav`), so on the
    // mobile project there is no visible opener at all until the menu is opened.
    // Same shape as switchLangTo() in helpers.ts, and the same reason.
    const desktopBtn = page.locator('.search-btn');
    if (await desktopBtn.isVisible()) {
      await desktopBtn.click();
    } else {
      const navOpen = await page.evaluate(() => document.body.classList.contains('nav-open'));
      if (!navOpen) await page.locator('.nav-hamburger').click();
      const mobileBtn = page.locator('.mobile-search-btn');
      await mobileBtn.waitFor({ state: 'visible' });
      await mobileBtn.click();
    }
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  }
  const input = overlay.locator('[data-search-input]');
  await input.fill(query);
  // The index is fetched lazily on first open; give the render a beat to settle.
  await expect
    .poll(async () => overlay.locator('.search-result, .search-empty').count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  return overlay.locator('.search-result').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? ''),
  );
}

test.describe('team pages are findable', () => {
  // Every one of these returned ZERO results before the index was generated.
  const cases: Array<[string, string]> = [
    ['d1', '/volleyball/d1'],
    ['lions', '/basketball/lions'],
    ['rhinos', '/basketball/rhinos'],
    ['hu20', '/volleyball/hu20'],
    ['du20', '/volleyball/du20'],
  ];

  for (const [query, expected] of cases) {
    test(`"${query}" finds ${expected}`, async ({ page }) => {
      await gotoWithLang(page, '/', 'de');
      const hrefs = await searchFor(page, query);
      expect(hrefs, `"${query}" should reach ${expected}`).toContain(expected);
    });
  }
});

test.describe('intent words reach the right page', () => {
  // These are what a prospective member types. None appeared in any page title or
  // meta description, so they matched nothing until `keywords` was added.
  const cases: Array<[string, string]> = [
    ['probetraining', '/club/kontakt'],
    ['kosten', '/weiteres/mitgliedschaft'],
    ['beitrag', '/weiteres/mitgliedschaft'],
    ['kinder', '/basketball/teams/nachwuchs'],
    ['anmelden', '/weiteres/anmeldung'],
  ];

  for (const [query, expected] of cases) {
    test(`"${query}" reaches ${expected}`, async ({ page }) => {
      await gotoWithLang(page, '/', 'de');
      const hrefs = await searchFor(page, query);
      expect(hrefs, `"${query}" should reach ${expected}`).toContain(expected);
    });
  }
});

test('a team result shows its name, not a raw dictionary key', async ({ page }) => {
  // tr() falls back to the key itself, so a broken entry renders plausibly. Assert the
  // human name to catch a regression that would otherwise look fine.
  await gotoWithLang(page, '/', 'de');
  await searchFor(page, 'lions');
  const title = page.locator('#site-search .search-result .search-result-title').first();
  await expect(title).toHaveText(/Lions/i);
});

test('team results survive the language toggle', async ({ page }) => {
  // The haystack is bilingual and built once, so an EN visitor must still match the
  // German-derived team names.
  await gotoWithLang(page, '/', 'de');
  await switchLangTo(page, 'en');
  const hrefs = await searchFor(page, 'd1');
  expect(hrefs).toContain('/volleyball/d1');
});

test('a nonsense query reports no results rather than everything', async ({ page }) => {
  await gotoWithLang(page, '/', 'de');
  const hrefs = await searchFor(page, 'zzzznotathing');
  expect(hrefs).toEqual([]);
  await expect(page.locator('#site-search .search-empty')).toBeVisible();
});
