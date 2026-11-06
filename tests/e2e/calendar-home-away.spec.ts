// Colour in the calendar means the sport. Home and away are solid vs outlined:
// they used to reuse the sport pair, so "VB" looked like "Home" and "BB" like "Away".
import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

const now = new Date();
const DATE = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;

const GAME = (id: string, type: string, sport: string) => ({
  id, game_id: `${sport === 'basketball' ? 'bb' : 'vb'}_${id}`, date: DATE, time: '20:00:00',
  home_team: 'Home side', away_team: 'Away side', home_score: 0, away_score: 0,
  status: 'scheduled', type, league: 'Liga', referees_json: null,
  kscw_team: { id: 1, name: 'Team', sport, color: '#1d4ed8' },
  hall: { id: 1, name: 'KWI A' },
});

// One more than a day cell shows, so the day popup opens from the "+1" button.
const GAMES = [
  GAME('1', 'home', 'volleyball'),
  GAME('2', 'home', 'basketball'),
  GAME('3', 'away', 'volleyball'),
  GAME('4', 'away', 'basketball'),
];

test('home and away do not share a colour with the sports', async ({ page }) => {
  const json = (data: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data }),
  });
  await page.route('**/items/games**', (route) => route.fulfill(json(GAMES)));
  await page.route('**/items/hall_closures**', (route) => route.fulfill(json([])));
  await page.route('**/items/teams**', (route) => route.fulfill(json([])));
  await gotoWithLang(page, '/weiteres/kalender', 'en');

  await page.locator('.cal-overflow').first().click();
  const modal = page.locator('.cal-modal');
  await expect(modal.locator('.cal-modal-row')).toHaveCount(4);

  const styleOf = (selector: string) => modal.locator(selector).first().evaluate((el) => {
    const { color, backgroundColor, boxShadow } = getComputedStyle(el);
    return { color, backgroundColor, boxShadow };
  });
  const [vb, bb, home, away] = await Promise.all([
    styleOf('.cal-tooltip-sport--vb'),
    styleOf('.cal-tooltip-sport--bb'),
    styleOf('.cal-tooltip-type--home'),
    styleOf('.cal-tooltip-type--away'),
  ]);

  for (const sport of [vb, bb]) {
    expect(home.color).not.toBe(sport.color);
    expect(home.backgroundColor).not.toBe(sport.backgroundColor);
    expect(away.color).not.toBe(sport.color);
  }
  expect(away.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(away.boxShadow).toContain('inset');
  expect(home.boxShadow).toBe('none');
});
