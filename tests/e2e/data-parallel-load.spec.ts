/**
 * Live data must not queue behind the dictionary, and a language toggle must not
 * throw the page away and fetch it again.
 *
 * Every consumer of window.i18nReady awaited it before its NETWORK CALL rather than
 * before its RENDER. Nothing in /kscw/public/team/<id>, /items/rankings,
 * /items/teams or /items/scorer_courses depends on the language, so that turned two
 * independent round trips into two sequential ones — about a second on a team
 * page's primary content.
 *
 * ⚠ How these tests are built, and why two earlier shapes were abandoned.
 *
 *  - "The data request starts before the dictionary finished" is FALSE on correct
 *    code here: the dictionary is same-origin off `astro preview` and lands in
 *    ~50 ms, while Directus is a real host taking seconds.
 *  - Delaying the dictionary by a fixed 1.5 s (and later 6 s) still left both
 *    Directus's latency and the body-parse time in the measurement, so on a box
 *    running eight workers it came out a coin flip.
 *
 * So BOTH sides are controlled and NEITHER is timed: Directus is stubbed to answer
 * instantly, and the dictionary request is pinned open until the assertion has run.
 * Ordering is then a property of the code alone. Regress to `i18nReady.then(fetch)`
 * and these fail deterministically.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

/**
 * Hold the dictionary request OPEN — not on a timer — and hand back the release.
 *
 * A timed delay is still a race: with eight workers on a loaded box, a slow body
 * parse can push the data request past any fixed delay even when nothing is chained,
 * which is exactly how the first three versions of this file flaked. Here the
 * dictionary provably cannot complete until the test says so, so the assertion has
 * no timing component at all.
 */
async function holdDictionary(page: import('@playwright/test').Page, lang: string) {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route(`**/js/i18n/${lang}.json*`, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/**
 * Answer every Directus call instantly with an empty collection. These tests assert
 * WHEN requests are issued, not what is rendered from them, so the payload only has
 * to be well-formed.
 */
async function stubDirectus(page: import('@playwright/test').Page) {
  await page.route('**/directus*.kscw.ch/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
  }));
}

/** English page, instant Directus, dictionary pinned open. Returns its release. */
async function openWithHeldDictionary(page: import('@playwright/test').Page, path: string) {
  await page.addInitScript(() => {
    try { localStorage.setItem('kscw-locale', 'en'); } catch { /* private mode */ }
  });
  await stubDirectus(page);
  const release = await holdDictionary(page, 'en');
  // Do not await load: the dictionary is held, so `load` may not fire promptly.
  await page.goto(path, { waitUntil: 'commit' });
  return release;
}

/**
 * The data request must go out while the held-back dictionary is STILL PENDING.
 *
 * Stated as presence, not as a timing margin: a Resource Timing entry only appears
 * once its request completes, so "the data entry exists and the dictionary entry
 * does not" is exactly the invariant, with no arithmetic to be thrown off by a
 * contended CPU. Comparing startTime against a constant — or even against the
 * dictionary's responseEnd — flaked under eight parallel workers, because a slow
 * body parse moves the data request without anything being chained.
 */
async function startsWhileDictionaryPending(page: import('@playwright/test').Page, needle: string) {
  const seen = (n: string) => page.evaluate(
    (x) => performance.getEntriesByType('resource').some((r) => r.name.includes(x)), n,
  );

  await expect.poll(
    () => seen(needle),
    { message: `${needle} was never requested`, timeout: 25_000 },
  ).toBe(true);

  // The dictionary is still pinned open at this point, so if the data request is
  // chained to it the poll above cannot have succeeded. This confirms the setup
  // rather than the code: a dictionary entry here means the hold leaked.
  expect(
    await seen('/js/i18n/'),
    'the dictionary completed despite being held — test setup is broken',
  ).toBe(false);
}

test.describe('live data does not queue behind the dictionary', () => {
  test('the team payload', async ({ page }) => {
    const release = await openWithHeldDictionary(page, '/volleyball/h1');
    await startsWhileDictionaryPending(page, '/kscw/public/team/');
    release();
  });

  test('the calendar\'s teams AND games — three round trips that were in series', async ({ page }) => {
    const release = await openWithHeldDictionary(page, '/weiteres/kalender');
    await startsWhileDictionaryPending(page, '/items/teams');
    // Games used to be requested from inside render(), i.e. after the teams list AND
    // after the dictionary.
    await startsWhileDictionaryPending(page, '/items/games');
    release();
  });

  test('the youth open/waitlist status', async ({ page }) => {
    const release = await openWithHeldDictionary(page, '/basketball/teams/nachwuchs');
    await startsWhileDictionaryPending(page, '/items/teams');
    release();
  });

  test('the scoreboard rankings', async ({ page }) => {
    const release = await openWithHeldDictionary(page, '/volleyball');
    await startsWhileDictionaryPending(page, '/items/rankings');
    release();
  });

  test('but the render still waits, so nothing paints untranslated', async ({ page }) => {
    // The other half of the contract: the wait MOVED, it did not disappear. A team
    // hero rendered before the dictionary would carry German tab labels.
    await gotoWithLang(page, '/volleyball/h1', 'en');
    await expect(page.locator('.team-hero h1')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('[data-tab="kader"]')).toHaveText('Roster');
  });
});

test.describe('the language toggle relabels instead of re-fetching', () => {
  test('a team page keeps its hero and makes no new team request', async ({ page }) => {
    await gotoWithLang(page, '/volleyball/h1', 'de');
    await expect(page.locator('.team-hero h1')).toBeVisible({ timeout: 25_000 });

    const after: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/kscw/public/team/')) after.push(r.url());
    });

    await switchLangTo(page, 'en');
    // The tab labels are the visible proof the relabel happened at all...
    await expect(page.locator('[data-tab="kader"]')).toHaveText('Roster');
    // ...and the hero must never have been emptied to get there.
    await expect(page.locator('.team-hero h1')).toBeVisible();
    expect(after, 'the toggle re-requested the team payload').toEqual([]);
  });

  test('the scoreboard makes no new rankings request', async ({ page }) => {
    // Stubbed so the first response is instant: the cache under test is filled in
    // the .then(), and toggling with the round trip still open would legitimately
    // refetch — the test would then be measuring its own race, which it was.
    await page.addInitScript(() => {
      try { localStorage.setItem('kscw-locale', 'de'); } catch { /* private mode */ }
    });
    await stubDirectus(page);

    const firstFetch = page.waitForResponse(
      (r) => r.url().includes('/items/rankings'), { timeout: 25_000 },
    );
    await page.goto('/volleyball');
    await firstFetch;
    // waitForResponse fires at the network layer; give the .then() that fills the
    // cache a turn of the event loop before toggling.
    await page.waitForFunction(
      () => performance.getEntriesByType('resource').some((r) => r.name.includes('/items/rankings')),
      undefined,
      { timeout: 10_000 },
    );

    const after: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/items/rankings')) after.push(r.url());
    });

    await switchLangTo(page, 'en');
    // Give a refetch every chance to appear before declaring it absent.
    await page.waitForTimeout(1500);
    expect(after, 'the toggle re-requested the rankings').toEqual([]);
  });
});
