/**
 * Eligible Jahrgänge on the youth pages.
 *
 * The unit tests pin the arithmetic and the two copies of it. What only a browser
 * can show is the part the arithmetic exists for: that the line survives
 * public/js/birth-years.js recomputing it on load (a static build must not
 * disagree with itself the moment the script runs), that it follows the language
 * toggle, and that the volleyball hero — which is built in JS, not by the build —
 * gets one at all.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

/** What the build rendered, before/after the recompute — they must agree. */
const yearsOn = (text: string) => text.replace(/\s+/g, ' ').trim();

test.describe('basketball youth cards', () => {
  test('state the Jahrgänge, and the recompute leaves them alone', async ({ page }) => {
    await gotoWithLang(page, '/basketball/teams/nachwuchs', 'de');

    const u8 = page.locator('.youth-card', { has: page.locator('[data-birth-age="8"]') }).first();
    await expect(u8.locator('.birth-years')).toContainText('Jahrgänge:');

    // Every line's numbers must match what birth-years.js computes for today — if
    // the script disagreed with the build, the page would visibly change after load.
    const drift = await page.evaluate(() => {
      const by = (window as unknown as {
        kscwBirthYears?: {
          text: (s: string, a: number, span?: number, team?: string | null) => string;
        };
      }).kscwBirthYears;
      if (!by) return ['birth-years.js did not load'];
      return [...document.querySelectorAll('[data-birth-age]')]
        .map((el) => {
          const shown = el.querySelector('.birth-years-value')?.textContent?.trim() ?? '';
          // data-birth-team included on purpose: a squad with hand-written years
          // (TEAM_BIRTH_YEARS) renders those, and the recompute has to reach the
          // same answer from the attribute alone or the card changes on load.
          const want = by.text(
            el.getAttribute('data-birth-sport')!,
            Number(el.getAttribute('data-birth-age')),
            Number(el.getAttribute('data-birth-span')),
            el.getAttribute('data-birth-team'),
          );
          return shown === want ? '' : `${el.getAttribute('data-birth-age')}: ${shown} ≠ ${want}`;
        })
        .filter(Boolean);
    });
    expect(drift).toEqual([]);
  });

  test('give the U18 girls a wider range than the U18 boys', async ({ page }) => {
    // 2026/27 runs no U16 girls' team, so the girls' cards take that group too.
    // Derived from Directus, so this asserts the shape (a span, not a pair) rather
    // than the literal years, which change with the season and the roster.
    await gotoWithLang(page, '/basketball/teams/nachwuchs', 'de');

    const values = (code: string) =>
      page.locator(`.youth-card:has(h3[data-team-title="${code}"]) .birth-years-value`);

    await expect(values('HU18').first()).toHaveText(/^\d{4}, \d{4}$/);
    const bounds = (text: string) => {
      const years = yearsOn(text).match(/\d{4}/g)!.map(Number);
      return { first: years[0], last: years[years.length - 1] };
    };
    const boys = bounds((await values('HU18').first().textContent()) ?? '');

    // Every girls' squad, not just the first: one of them states its own years by
    // hand (TEAM_BIRTH_YEARS) and starts a year earlier than the category does.
    const girlsCards = await values('DU18').allTextContents();
    expect(girlsCards.length).toBeGreaterThan(0);
    for (const text of girlsCards) {
      const girls = bounds(text);
      expect(girls.first, text).toBeLessThanOrEqual(boys.first);
      expect(girls.last, text).toBeGreaterThan(boys.last);
    }
  });

  test('follow the language toggle', async ({ page }) => {
    await gotoWithLang(page, '/basketball/teams/nachwuchs', 'de');
    const line = page.locator('.birth-years').first();
    await expect(line).toContainText('Jahrgänge:');

    await switchLangTo(page, 'en');
    await expect(line).toContainText('Birth years:');
    // The years themselves are language-neutral and must not be translated away.
    await expect(line.locator('.birth-years-value')).toHaveText(/^\d{4}/);
  });
});

test.describe('volleyball youth', () => {
  /**
   * A team detail page paints nothing until public/js/team-page.js has fetched the
   * team from the live Directus — the hero, and so the years line inside it, only
   * exist after that round trip. With eight workers hitting the same API the
   * default 5s expect timeout is not enough, and the whole suite went flaky on this
   * one assertion, so the wait for the hero is explicit and generous.
   */
  const HERO_TIMEOUT = 20_000;

  test('states the open-ended Jahrgang on the team hero', async ({ page }) => {
    await gotoWithLang(page, '/volleyball/hu20', 'de');

    const line = page.locator('.team-hero .birth-years');
    await expect(line).toContainText('Jahrgang:', { timeout: HERO_TIMEOUT });
    await expect(line).toContainText('und jünger');
    await expect(line.locator('.birth-years-value')).toHaveText(/^\d{4}$/);
  });

  test('carries the line on the Nachwuchs cards too', async ({ page }) => {
    await gotoWithLang(page, '/volleyball', 'de');

    const cards = page.locator('.team-card .birth-years');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toContainText('und jünger');
  });

  test('leaves the adult teams without an age category', async ({ page }) => {
    await gotoWithLang(page, '/volleyball/h1', 'de');
    // The hero has to be there before "no line" means anything — otherwise this
    // passes on a page that rendered nothing at all.
    await expect(page.locator('.team-hero h1')).toBeVisible({ timeout: HERO_TIMEOUT });
    await expect(page.locator('.birth-years')).toHaveCount(0);
  });
});
