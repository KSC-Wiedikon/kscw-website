// Cup fixtures carry no competition-type field in Directus — the only marker is
// the league string ("Züri Cup — 1/8-Final, Spiel 4"). These drive the real
// homepage tables with a stubbed games response to check the trophy lands on
// exactly those rows.
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const GAME = (id: string, league: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, game_id: id, date, time: '20:00:00',
  home_team: 'KSC Wiedikon D2', away_team: 'VBC Limmattal D1',
  home_score: null, away_score: null, status: 'scheduled',
  type: 'home', league, season: '2026/27', sets_json: null,
  kscw_team: { id: 1, name: 'D2', sport: 'volleyball', color: '#e0218a' },
  hall: { id: 1, name: 'Sihlhölzli', address: 'Zürich' },
  ...extra,
});

const UPCOMING = [
  GAME('vb_1', 'Frauen 3. Liga Gruppe A', '2030-09-15'),
  GAME('vb_2', 'Züri Cup — 1/8-Final, Spiel 4', '2030-09-17'),
  GAME('vb_3', 'Mobiliar Volley Cup — Runde 1, Spiel 37', '2030-09-20'),
];

async function stubGames(page: Page) {
  await page.route('**/items/games**', (route) => {
    // The page fetches upcoming (sort=date,time) and completed (sort=-date,-time).
    const upcoming = decodeURIComponent(route.request().url()).includes('sort=date');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: upcoming ? UPCOMING : [] }),
    });
  });
}

test('only cup fixtures get the trophy marker', async ({ page }) => {
  await stubGames(page);
  await gotoWithLang(page, '/', 'de');

  const rows = page.locator('#upcoming-games-list tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).not.toHaveClass(/is-cup/);
  await expect(rows.nth(0).locator('.game-cup-icon')).toHaveCount(0);
  await expect(rows.nth(1)).toHaveClass(/is-cup/);
  await expect(rows.nth(2)).toHaveClass(/is-cup/);
  // The competition name is the tooltip / accessible name of the marker.
  await expect(rows.nth(1).locator('.gt-date .game-cup-icon'))
    .toHaveAttribute('aria-label', 'Züri Cup — 1/8-Final, Spiel 4');
});

test('the trophy slot keeps cup and league rows aligned', async ({ page }) => {
  // Same date on every row, so the only thing that could move the later cells
  // is the trophy itself (the display font's digits are not tabular).
  await page.route('**/items/games**', (route) => {
    const upcoming = decodeURIComponent(route.request().url()).includes('sort=date');
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: upcoming ? [
        GAME('vb_1', 'Frauen 3. Liga Gruppe A', '2030-09-17'),
        GAME('vb_2', 'Züri Cup — 1/8-Final, Spiel 4', '2030-09-17'),
      ] : [] }),
    });
  });
  await gotoWithLang(page, '/', 'de');

  const table = page.locator('#upcoming-games-list');
  await expect(table).toHaveClass(/has-cup/);
  // Each row is its own grid, so an in-flow trophy would push the cup row's
  // remaining cells out of line with the league row's.
  const offsets = await table.locator('tbody tr .gt-matchup')
    .evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().x)));
  expect(offsets).toHaveLength(2);
  expect(new Set(offsets).size).toBe(1);
});

test('a table without cup games reserves no slot', async ({ page }) => {
  await page.route('**/items/games**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: [GAME('vb_1', 'Frauen 3. Liga Gruppe A', '2030-09-15')] }),
  }));
  await gotoWithLang(page, '/', 'de');

  await expect(page.locator('#upcoming-games-list tbody tr')).toHaveCount(1);
  await expect(page.locator('#upcoming-games-list')).not.toHaveClass(/has-cup/);
  await expect(page.locator('.game-cup-icon')).toHaveCount(0);
});

test('the game modal badges cup fixtures too', async ({ page }) => {
  await stubGames(page);
  await gotoWithLang(page, '/', 'de');

  await page.locator('#upcoming-games-list tbody tr.is-cup').first().click();
  const badge = page.locator('.game-modal .badge').first();
  await expect(badge).toHaveText('Züri Cup — 1/8-Final, Spiel 4');
  await expect(badge).toHaveClass(/badge-cup/);
  await expect(badge.locator('.game-cup-icon')).toHaveCount(1);
});
