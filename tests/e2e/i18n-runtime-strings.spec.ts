/**
 * Strings that were wrong permanently, not just for the length of the flash.
 *
 * Three separate causes, one shape: text that reaches the page without a data-i18n
 * key on the node, so the i18n engine can never repair it.
 *
 *  - /club/feedback rendered its changelog heading with t('de', …) INSIDE the
 *    English-only block, so an English visitor read "WAS IST NEU" above 600 lines
 *    of English changelog, forever.
 *  - The homepage game tables are injected during body parse, when the dictionary
 *    is provably not loaded yet, and kept the German fallback for the life of the
 *    page.
 *  - The "no news" placeholders shipped visible, asserting something false until
 *    Directus answered.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

test.describe('changelog heading', () => {
  test('the English block says "What\'s new", not "Was ist neu"', async ({ page }) => {
    await gotoWithLang(page, '/club/feedback', 'en');

    const heading = page.locator('[data-lang-only="en"] .changelog-heading');
    await expect(heading).toContainText("What's new");
    await expect(heading).not.toContainText('Was ist neu');
  });

  test('German still reads German', async ({ page }) => {
    await gotoWithLang(page, '/club/feedback', 'de');
    await expect(page.locator('[data-lang-only="de"] .changelog-heading')).toContainText('Was ist neu');
  });

  test('translating the heading does not eat the icon or the version badge', async ({ page }) => {
    // The reason the key is on a span and not on the <h2>: applyTranslations()
    // writes textContent, which would remove both siblings.
    await gotoWithLang(page, '/club/feedback', 'en');
    const heading = page.locator('[data-lang-only="en"] .changelog-heading');

    await expect(heading.locator('svg, i[data-lucide]')).toHaveCount(1);
    await expect(heading.locator('.changelog-badge')).toHaveText(/^v\d+\.\d+\.\d+$/);
  });
});

test.describe('homepage game tables', () => {
  test('the loading row is translated, not frozen in German', async ({ page }) => {
    // Hold the games endpoint open so the placeholder is what is on screen.
    await page.route('**/items/games*', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await gotoWithLang(page, '/', 'en');

    const cell = page.locator('#upcoming-games-list tbody td').first();
    await expect(cell).toHaveText('Loading…');
  });

  test('the empty state is translated too', async ({ page }) => {
    await page.route('**/items/games*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
    }));
    await gotoWithLang(page, '/', 'en');

    await expect(page.locator('#upcoming-games-list td.game-empty')).toHaveText('No games found.');
  });

  test('and it follows a later language toggle', async ({ page }) => {
    await page.route('**/items/games*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
    }));
    await gotoWithLang(page, '/', 'de');
    await expect(page.locator('#upcoming-games-list td.game-empty')).toHaveText('Keine Spiele gefunden.');

    await switchLangTo(page, 'en');
    await expect(page.locator('#upcoming-games-list td.game-empty')).toHaveText('No games found.');
  });
});

test.describe('the "no news" placeholders', () => {
  test('stay hidden while the homepage is still fetching', async ({ page }) => {
    await page.route('**/items/news*', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await gotoWithLang(page, '/', 'de');

    await expect(page.locator('#news-empty')).toBeHidden();
  });

  test('appear when there genuinely is no news', async ({ page }) => {
    await page.route('**/items/news*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
    }));
    await gotoWithLang(page, '/', 'en');

    await expect(page.locator('#news-empty')).toBeVisible();
    await expect(page.locator('#news-empty')).toHaveText('No news available.');
  });

  test('do not flash on a /news filter click', async ({ page }) => {
    // Fully stubbed: asserting on live Directus made this depend on the club having
    // published news, which is not what is under test.
    const article = {
      id: 1, title: 'Testartikel', title_en: 'Test article', slug: 'testartikel',
      excerpt: 'Kurz', body: '<p>Text</p>', category: 'volleyball', author: 'KSCW',
      published_at: '2026-08-01', image: null, date_created: '2026-08-01',
    };
    let slow = false;
    await page.route('**/items/news*', async (route) => {
      if (slow) await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ data: [article] }),
      });
    });

    await gotoWithLang(page, '/news', 'de');
    await expect(page.locator('.news-card').first()).toBeVisible();
    await expect(page.locator('#news-empty')).toBeHidden();

    // Now the filter refetch is slow — the window in which the placeholder used to
    // reappear and claim there was no news.
    slow = true;
    await page.locator('#news-filter-tabs .sport-tab[data-filter="volleyball"]').click();
    await expect(page.locator('#news-empty')).toBeHidden();
    await expect(page.locator('.news-card').first()).toBeVisible();
  });
});
