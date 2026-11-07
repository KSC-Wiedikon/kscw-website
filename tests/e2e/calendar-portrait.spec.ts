// In portrait a day cell is too narrow for a chip, so the grid shows dots and the
// tapped day is listed underneath it. A real Saturday here holds up to 14 games.
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const THIS_MONTH = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const NEXT_MONTH = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;

let seq = 0;
const GAME = (date: string, type: string, sport: string, time = '20:00:00') => {
  seq += 1;
  return {
    id: seq, game_id: `${sport === 'basketball' ? 'bb' : 'vb'}_${seq}`, date, time,
    home_team: type === 'home' ? `KSC Wiedikon T${seq}` : `Opponent ${seq}`,
    away_team: type === 'home' ? `Opponent ${seq}` : `KSC Wiedikon T${seq}`,
    home_score: 0, away_score: 0, status: 'scheduled', type, league: 'Liga', referees_json: null,
    kscw_team: { id: seq, name: `T${seq}`, sport, color: '#1d4ed8' },
    hall: { id: 1, name: 'KWI A' },
  };
};

// Day 15: the busiest real day. Volleyball comes first in the day, so a plain
// first-three pick would show no basketball at all.
const BUSY_DAY = [
  ...Array.from({ length: 12 }, () => GAME(`${THIS_MONTH}-15`, 'home', 'volleyball')),
  GAME(`${THIS_MONTH}-15`, 'away', 'basketball', '21:00:00'),
  GAME(`${THIS_MONTH}-15`, 'away', 'volleyball', '21:30:00'),
];
const GAMES = [...BUSY_DAY, GAME(`${NEXT_MONTH}-10`, 'home', 'basketball')];
const CLOSURES = [{
  id: 1, start_date: `${THIS_MONTH}-22`, end_date: `${THIS_MONTH}-22`,
  reason: 'KWI Turnier', source: 'manual', hall: { id: 1, name: 'KWI A' },
}];

async function openCalendar(page: Page) {
  const json = (data: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data }),
  });
  await page.route('**/items/games**', (route) => route.fulfill(json(GAMES)));
  await page.route('**/items/hall_closures**', (route) => route.fulfill(json(CLOSURES)));
  await page.route('**/items/teams**', (route) => route.fulfill(json([])));
  await gotoWithLang(page, '/weiteres/kalender', 'en');
  await page.waitForSelector('.cal-grid');
}

// Only the shown month's days are buttons, so index = day - 1.
const day = (page: Page, n: number) => page.locator('.cal-grid--portrait button.cal-cell').nth(n - 1);

test.use({ viewport: { width: 390, height: 844 } });

test('the grid fits at every phone width, even on the busiest day', async ({ page }) => {
  await openCalendar(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      cells: [...document.querySelectorAll('.cal-dots')].filter((dots) => {
        const cell = dots.closest('.cal-cell')!.getBoundingClientRect();
        const box = dots.getBoundingClientRect();
        return box.left < cell.left || box.right > cell.right;
      }).length,
    }));
    expect(overflow, `at ${width}px`).toEqual({ page: 0, cells: 0 });
    // Every day is a tap target of at least 44px in height, about 40px wide at 320.
    expect((await day(page, 15).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('a day shows three dots and the rest as a number, both sports included', async ({ page }) => {
  await openCalendar(page);
  await expect(page.locator('.cal-entry')).toHaveCount(0);
  const busy = day(page, 15);
  await expect(busy.locator('.cal-dot')).toHaveCount(3);
  await expect(busy.locator('.cal-dot--bb')).toHaveCount(1);
  await expect(busy.locator('.cal-dots-more')).toHaveText('+11');
  await expect(busy).toHaveAttribute('aria-label', /14 games/);
  // Hollow means away. The basketball game is away; the volleyball dots are home.
  await expect(busy.locator('.cal-dot--bb.cal-dot--away')).toHaveCount(1);
});

test('tapping a day lists it under the grid, and a row opens its details', async ({ page }) => {
  await openCalendar(page);
  await day(page, 15).click();

  await expect(day(page, 15)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cal-grid [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.cal-agenda-row')).toHaveCount(14);
  await expect(page.locator('.cal-agenda-count')).toHaveText('14 games');

  await page.locator('.cal-agenda-row').first().click();
  await expect(page.locator('.cal-modal-title')).toContainText('Opponent');
  await page.locator('.cal-modal-close').click();

  await day(page, 16).click();
  await expect(page.locator('.cal-agenda-row')).toHaveCount(0);
  await expect(page.locator('.cal-agenda-empty')).toHaveText('Nothing on this day.');
  await expect(page.locator('.cal-agenda-count')).toHaveText('');
});

test('the heading stays in place between taps, so a screen reader hears the change', async ({ page }) => {
  await openCalendar(page);
  await day(page, 15).click();
  const title = page.locator('.cal-agenda-date');
  await title.evaluate((el) => { el.setAttribute('data-same-node', 'yes'); });
  await day(page, 16).click();
  await expect(title).toHaveAttribute('data-same-node', 'yes');
  await expect(title).toHaveAttribute('aria-live', 'polite');
  await expect(title).toContainText('16');
});

test('a closed day is marked by more than its tint and listed by name', async ({ page }) => {
  await openCalendar(page);
  await expect(day(page, 22).locator('.cal-closure-icon')).toHaveCount(1);
  await expect(day(page, 22)).toHaveAttribute('aria-label', /Hall closed/);
  await day(page, 22).click();
  await expect(page.locator('.cal-agenda-row')).toHaveCount(1);
  await expect(page.locator('.cal-agenda-row')).toContainText('KWI Turnier');
});

test('another month opens on its first busy day', async ({ page }) => {
  await openCalendar(page);
  await page.locator('.cal-nav-btn').last().click();
  await expect(page.locator('.cal-cell--selected .cal-day-num')).toHaveText('10');
  await expect(page.locator('.cal-agenda-row')).toHaveCount(1);
});

test('a tap brings the list on screen when it sits below the fold', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openCalendar(page);
  await day(page, 16).click();
  await expect.poll(() => page.locator('.cal-agenda').evaluate((el) => el.getBoundingClientRect().top))
    .toBeLessThan(667 - 100);
  // The day that was tapped has not been scrolled away under the sticky header.
  const header = await page.locator('header').first().boundingBox();
  const tapped = await day(page, 16).boundingBox();
  expect(tapped!.y).toBeGreaterThanOrEqual(header!.height);
});

test('a tablet in portrait gets the list, in landscape the chips', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openCalendar(page);
  await expect(page.locator('.cal-entry')).toHaveCount(0);
  await expect(page.locator('.cal-agenda')).toHaveCount(1);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.cal-entry').first()).toBeVisible();
  await expect(page.locator('.cal-agenda')).toHaveCount(0);
});

test('rotating the phone swaps layouts and keeps the chosen day', async ({ page }) => {
  await openCalendar(page);
  await day(page, 15).click();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.cal-entry').first()).toBeVisible();
  await expect(page.locator('.cal-agenda')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.cal-entry')).toHaveCount(0);
  await expect(day(page, 15)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cal-agenda-row')).toHaveCount(14);
});
