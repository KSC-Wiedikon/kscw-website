// The team filter, mostly used on a phone: 29 teams in a small scrolling list, so
// ticking several has to stay cheap.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const now = new Date();
const DATE = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;

const VB = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `VB${i + 1}`, sport: 'volleyball', color: '#1d4ed8' }));
const BB = Array.from({ length: 17 }, (_, i) => ({ id: i + 101, name: `BB${i + 1}`, sport: 'basketball', color: '#d97706' }));
const TEAMS = [...VB, ...BB];

// One game per team on the same day, so the day's list shows what the filter lets through.
const GAMES = TEAMS.map((t) => ({
  id: t.id, game_id: `${t.sport === 'basketball' ? 'bb' : 'vb'}_${t.id}`, date: DATE, time: '20:00:00',
  home_team: `KSC Wiedikon ${t.name}`, away_team: `Opponent ${t.name}`, home_score: 0, away_score: 0,
  status: 'scheduled', type: 'home', league: 'Liga', referees_json: null,
  kscw_team: t, hall: { id: 1, name: 'KWI A' },
}));

const SPORT = 1;
const TEAM = 2;
const filterBtn = (page: Page, index: number) => page.locator('.cal-filter-wrap').nth(index).locator('.cal-filter-btn');
const dropdown = (page: Page) => page.locator('.cal-filter-dropdown:visible');
const list = (page: Page) => dropdown(page).locator('.cal-filter-list');
const option = (page: Page, name: string) =>
  dropdown(page).locator('.cal-filter-option', { hasText: new RegExp(`^${name}$`) });
const action = (page: Page, name: string) => dropdown(page).getByRole('button', { name, exact: true });
const rows = (page: Page) => page.locator('.cal-agenda-row');

async function openCalendar(page: Page, lang: 'en' | 'de' = 'en') {
  const json = (data: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data }),
  });
  await page.route('**/items/games**', (route) => route.fulfill(json(GAMES)));
  await page.route('**/items/hall_closures**', (route) => route.fulfill(json([])));
  await page.route('**/items/teams**', (route) => route.fulfill(json(TEAMS)));
  // Tapping a day below scrolls the page to its list; instantly, so nothing here
  // measures a position while that scroll is still running.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoWithLang(page, '/weiteres/kalender', lang);
  await page.waitForSelector('.cal-grid');
  await page.locator('.cal-grid--portrait button.cal-cell').nth(14).click();
  await expect(rows(page)).toHaveCount(29);
}

// For the tests that measure positions. Playwright's click scrolls its target into
// view first, and with the site's smooth scrolling that scroll can outlast the click
// and move the page with no tick at all. A finger does neither, so tap the coordinates.
async function tap(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function pageAtRest(page: Page) {
  await expect.poll(async () => {
    const first = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(150);
    return first === await page.evaluate(() => window.scrollY);
  }).toBe(true);
}

// Part of the way down, with the filters clear of the sticky header.
async function scrollToFilters(page: Page) {
  await pageAtRest(page);
  await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }));
  await pageAtRest(page);
}

test.use({ viewport: { width: 390, height: 844 } });

test('filtering a sport out takes its teams out of the team list', async ({ page }) => {
  await openCalendar(page);

  await filterBtn(page, SPORT).click();
  await option(page, 'Basketball').click();

  await filterBtn(page, TEAM).click();
  await expect(dropdown(page).locator('.cal-filter-option')).toHaveCount(12);
  await expect(dropdown(page).locator('.cal-filter-group-label')).toHaveText(['Volleyball']);
  await expect(filterBtn(page, TEAM)).toContainText('All Teams');

  await filterBtn(page, SPORT).click();
  await option(page, 'Basketball').click();
  await filterBtn(page, TEAM).click();
  await expect(dropdown(page).locator('.cal-filter-option')).toHaveCount(29);
  await expect(dropdown(page).locator('.cal-filter-group-label')).toHaveText(['Volleyball', 'Basketball']);
});

test('only the other sport left: its teams are labelled as that sport', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, SPORT).click();
  await option(page, 'Volleyball').click();
  await filterBtn(page, TEAM).click();
  await expect(dropdown(page).locator('.cal-filter-group-label')).toHaveText(['Basketball']);
  await expect(dropdown(page).locator('.cal-filter-option')).toHaveCount(17);
  await expect(option(page, 'BB1')).toBeVisible();
});

test('a tick leaves the list and the page where they were', async ({ page }) => {
  await openCalendar(page);
  await scrollToFilters(page);
  await tap(page, filterBtn(page, TEAM));
  await list(page).evaluate((el) => { el.scrollTop = 200; });

  // Two in a row, the way someone picks a few teams.
  await tap(page, option(page, 'VB8'));
  await expect(rows(page)).toHaveCount(28);
  await tap(page, option(page, 'VB9'));
  await expect(rows(page)).toHaveCount(27);

  await expect(option(page, 'VB8').locator('input')).not.toBeChecked();
  await expect(option(page, 'VB9').locator('input')).not.toBeChecked();
  expect(await list(page).evaluate((el) => el.scrollTop)).toBe(200);
  await pageAtRest(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(120);
});

// In German the Reset button that the first tick adds wraps onto a line of its own.
test('the list does not move when the first tick adds the reset button', async ({ page }) => {
  await openCalendar(page, 'de');
  await scrollToFilters(page);
  await tap(page, filterBtn(page, TEAM));
  const before = (await dropdown(page).boundingBox())!.y;

  await tap(page, option(page, 'VB1'));

  await expect(page.locator('.cal-filter-reset')).toHaveCount(1);
  await pageAtRest(page);
  expect((await dropdown(page).boundingBox())!.y).toBe(before);
});

// A shorter sport label frees room on the first line: a team button that shrank with
// its own label would jump up there, and take the list with it.
test('the list does not move on a tick with a sport filtered out either', async ({ page }) => {
  await openCalendar(page, 'de');
  await scrollToFilters(page);
  await tap(page, filterBtn(page, SPORT));
  await tap(page, option(page, 'Basketball'));
  await tap(page, filterBtn(page, TEAM));
  const before = (await dropdown(page).boundingBox())!.y;

  await tap(page, option(page, 'VB1'));
  await expect(filterBtn(page, TEAM)).toContainText('11 Teams');
  expect((await dropdown(page).boundingBox())!.y).toBe(before);

  await tap(page, action(page, 'Alle abwählen'));
  await expect(filterBtn(page, TEAM)).toContainText('Keine Teams');
  await pageAtRest(page);
  expect((await dropdown(page).boundingBox())!.y).toBe(before);
});

test('the keyboard stays on the same team after a tick', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, TEAM).click();
  await option(page, 'VB3').locator('input').focus();
  await page.keyboard.press('Space');

  await expect(rows(page)).toHaveCount(28);
  await expect(option(page, 'VB3').locator('input')).toBeFocused();
});

test('deselect all, then tick only the teams you want', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, TEAM).click();

  await action(page, 'Deselect all').click();
  await expect(filterBtn(page, TEAM)).toContainText('No teams');
  await expect(rows(page)).toHaveCount(0);
  await expect(dropdown(page).locator('input:checked')).toHaveCount(0);

  await option(page, 'VB3').click();
  await expect(filterBtn(page, TEAM)).toContainText('1 Team');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('VB3');

  await option(page, 'BB2').click();
  await expect(filterBtn(page, TEAM)).toContainText('2 Teams');
  await expect(rows(page)).toHaveCount(2);

  await action(page, 'Select all').click();
  await expect(filterBtn(page, TEAM)).toContainText('All Teams');
  await expect(rows(page)).toHaveCount(29);
  await expect(page.locator('.cal-filter-reset')).toHaveCount(0);
});

test('deselect all only touches the teams on show', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, SPORT).click();
  await option(page, 'Basketball').click();
  await filterBtn(page, TEAM).click();
  await action(page, 'Deselect all').click();
  await expect(filterBtn(page, TEAM)).toContainText('No teams');
  await expect(rows(page)).toHaveCount(0);

  await filterBtn(page, SPORT).click();
  await option(page, 'Basketball').click();
  await expect(filterBtn(page, TEAM)).toContainText('17 Teams');
  await expect(rows(page)).toHaveCount(17);
});

test('reset brings every team back after deselect all', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, TEAM).click();
  await action(page, 'Deselect all').click();
  await page.locator('.cal-filter-reset').click();
  await expect(filterBtn(page, TEAM)).toContainText('All Teams');
  await expect(rows(page)).toHaveCount(29);
});

test('select all and deselect all stay on screen while the list scrolls', async ({ page }) => {
  await openCalendar(page);
  await filterBtn(page, TEAM).click();
  await list(page).evaluate((el) => { el.scrollTop = el.scrollHeight; });

  const box = (await dropdown(page).boundingBox())!;
  const button = (await action(page, 'Deselect all').boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(box.y);
  expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);

  await action(page, 'Deselect all').click();
  await expect(rows(page)).toHaveCount(0);
});

test('the list fits a phone and is easy to tap', async ({ page }) => {
  await openCalendar(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await filterBtn(page, TEAM).click();
    const box = (await dropdown(page).boundingBox())!;
    expect(box.x, `at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `at ${width}px`).toBeLessThanOrEqual(width);
    // Wide enough for a real team name, not just for its button.
    expect(box.width, `at ${width}px`).toBeGreaterThanOrEqual(width - 48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

    if (await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)) {
      expect((await option(page, 'VB1').boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await action(page, 'Select all').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await filterBtn(page, TEAM).click();
  }
});
