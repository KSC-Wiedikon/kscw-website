// The homepage game tables bold our side of the matchup — the home name when we
// host, the away name when we travel, both in a derby (one fixture stored as two
// rows, merged into one by mergeDerbies).
import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

const GAME = (id: string, gameId: string, date: string, extra: Record<string, unknown>) => ({
  id, game_id: gameId, date, time: '20:00:00',
  home_score: null, away_score: null, status: 'scheduled',
  league: 'Herren 3. Liga Gruppe A', season: '2026/27', sets_json: null,
  hall: { id: 1, name: 'Sihlhölzli', address: 'Zürich' },
  ...extra,
});

const H1 = { id: 1, name: 'H1', sport: 'volleyball', color: '#1d4ed8' };
const H3 = { id: 3, name: 'H3', sport: 'volleyball', color: '#3b82f6' };

const UPCOMING = [
  GAME('vb_1', 'g1', '2030-09-15', { type: 'home', home_team: 'KSC Wiedikon H1', away_team: 'Volley Uster', kscw_team: H1 }),
  GAME('vb_2', 'g2', '2030-09-16', { type: 'away', home_team: 'TV Muttenz 1', away_team: 'KSC Wiedikon H1', kscw_team: H1 }),
  GAME('vb_3', 'g3', '2030-09-17', { type: 'home', home_team: 'KSC Wiedikon H1', away_team: 'KSC Wiedikon H3', kscw_team: H1 }),
  GAME('vb_4', 'g3', '2030-09-17', { type: 'away', home_team: 'KSC Wiedikon H1', away_team: 'KSC Wiedikon H3', kscw_team: H3 }),
];

test('our side of the matchup is bold, home or away', async ({ page }) => {
  await page.route('**/items/games**', (route) => {
    const upcoming = decodeURIComponent(route.request().url()).includes('sort=date');
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: upcoming ? UPCOMING : [] }),
    });
  });
  // The tables wait for the hall-scoreboard history too; left to the real
  // Directus, a slow answer keeps them on "Laden…" past the timeout.
  await page.route('**/items/live_history**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
  }));
  await gotoWithLang(page, '/', 'de');

  const rows = page.locator('#upcoming-games-list tbody tr');
  await expect(rows).toHaveCount(3);

  const sides = await rows.evaluateAll((trs) => trs.map((tr) => {
    const weight = (sel: string) => Number(getComputedStyle(tr.querySelector(sel)!).fontWeight);
    return [weight('.gt-home-team') >= 600, weight('.gt-away-team') >= 600];
  }));
  expect(sides).toEqual([
    [true, false], // home game: KSC Wiedikon H1 vs Volley Uster
    [false, true], // away game: TV Muttenz 1 vs KSC Wiedikon H1
    [true, true],  // derby: both sides are ours
  ]);
});
