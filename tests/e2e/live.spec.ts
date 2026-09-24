/**
 * /live — the public port of wiedisync's live scoreboard, plus the site-wide
 * "live now" pill.
 *
 * Directus is stubbed so the assertions are on the rendering, not on whatever the
 * hall scoreboard happens to be showing while CI runs.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

const VOLLEY_LIVE = {
  channel: 'kscw', sport: 'volleyball', status: 'live', event: 'set-end', ts: '1790181470926',
  over: false, period: 3, side_a: 'left',
  team_a_name: 'KSC WIEDIKON H1', team_a_short: 'KSCW H1', team_a_color: '#2563eb',
  team_b_name: 'KSC WIEDIKON H3', team_b_short: 'KSCW H3', team_b_color: '#ef4444',
  points_a: 12, points_b: 9, sets_won_a: 1, sets_won_b: 1,
  timeouts_a: 1, timeouts_b: 2, subs_a: 3, subs_b: 0, fouls_a: 0, fouls_b: 0,
  serving_team: 'right', set_results: [{ a: 25, b: 21 }, { a: 22, b: 25 }],
  date_updated: '2026-09-23T16:37:51.154Z',
};

const HISTORY = [{
  id: 'h1', sport: 'basketball', team_a_short: 'KSCW H2', team_a_name: null,
  team_b_short: 'BCW', team_b_name: null, points_a: 71, points_b: 64,
  sets_won_a: 0, sets_won_b: 0, set_results: [], finished_at: '2026-09-20T19:45:00Z',
}];

async function stubLive(page: Page, row: object | null, history: object[] = []) {
  await page.route('**/items/live_scores**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: row ? [row] : [] }),
  }));
  await page.route('**/items/live_history**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: history }),
  }));
}

test.describe('/live', () => {
  test('renders a live volleyball board', async ({ page }) => {
    await stubLive(page, VOLLEY_LIVE, HISTORY);
    await gotoWithLang(page, '/live', 'de');

    const board = page.locator('#live-board');
    await expect(board.locator('.live-score')).toHaveText(['12', '9']);
    await expect(board.locator('.live-set-chip')).toHaveCount(2);
    await expect(board.locator('.live-mid-value')).toHaveText('1:1');
    await expect(board).toContainText('Satz 3');
    await expect(board).toContainText('AZ 1 · W 3');
    // Team B serves → the dot sits in B's column only.
    await expect(board.locator('.live-col--b .live-serve-dot')).toHaveCount(1);
    await expect(board.locator('.live-col--a .live-serve-dot')).toHaveCount(0);
    await expect(page.locator('#live-status')).toHaveAttribute('data-tone', 'live');
    await expect(page.locator('#live-sport')).toHaveText('Volleyball');
    await expect(page.locator('#live-event')).toHaveText('Satz beendet');

    await expect(page.locator('#live-recent')).toBeVisible();
    await expect(page.locator('#live-recent-body tr')).toHaveCount(1);
    await expect(page.locator('#live-recent-body')).toContainText('71:64');
    await expect(page.locator('#live-recent-body')).toContainText('20.09.2026 21:45');
  });

  test('switches the board text to English, including parameterised strings', async ({ page }) => {
    await stubLive(page, VOLLEY_LIVE);
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('#live-board')).toContainText('Satz 3');

    await switchLangTo(page, 'en');
    await expect(page.locator('#live-board')).toContainText('Set 3');
    await expect(page.locator('#live-board')).toContainText('TO 1 · Sub 3');
    await expect(page.locator('#live-event')).toHaveText('Set finished');
  });

  test('shows the final summary with the winner', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, status: 'final', event: 'match-end', sets_won_a: 3, sets_won_b: 1 });
    await gotoWithLang(page, '/live', 'de');
    const final = page.locator('.live-final');
    await expect(final).toContainText('KSCW H1');
    await expect(final).toContainText('gewinnt das Spiel');
    await expect(final.locator('.live-final-score')).toHaveText('3:1');
    await expect(page.locator('#live-status')).toHaveAttribute('data-tone', 'final');
  });

  test('renders basketball with period, fouls and bonus', async ({ page }) => {
    await stubLive(page, {
      ...VOLLEY_LIVE, sport: 'basketball', event: null, period: 5, points_a: 80, points_b: 78,
      fouls_a: 5, fouls_b: 2, serving_team: 'left', set_results: [],
    });
    await gotoWithLang(page, '/live', 'de');
    const board = page.locator('#live-board');
    await expect(board.locator('.live-score')).toHaveText(['80', '78']);
    await expect(board.locator('.live-mid-value')).toHaveText('VL1');
    // A has 5 fouls → B is in the bonus.
    await expect(board.locator('.live-col--b .live-bonus')).toBeVisible();
    await expect(board.locator('.live-col--a .live-bonus')).toHaveCount(0);
    await expect(board.locator('.live-set-chip')).toHaveCount(0);
  });

  test('shows the empty state when the board is idle', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, status: 'idle' });
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('#live-status')).toHaveAttribute('data-tone', 'idle');
    await expect(page.locator('#live-board .live-empty')).toContainText('Zurzeit kein Live-Spiel');
    await expect(page.locator('#live-recent')).toBeHidden();
  });

  test('team colours from the board never reach a style unless they are plain hex', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, team_a_color: 'red;background:url(//evil)' });
    await gotoWithLang(page, '/live', 'de');
    const chip = page.locator('.live-col--a .live-team-chip');
    await expect(chip).toHaveAttribute('style', /background-color: rgb\(37, 99, 235\)/);
  });
});

test.describe('live-now pill', () => {
  test('appears site-wide while a match is live and links to /live', async ({ page }) => {
    await stubLive(page, VOLLEY_LIVE);
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    const pill = page.locator('.live-now-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('href', '/live');
    await expect(pill).toContainText('KSCW H1 12 : 9 KSCW H3');
  });

  test('stays away when the board shows a finished match', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, status: 'final' });
    // Wait for the pill's own poll to be answered, then give its handler a tick.
    const polled = page.waitForResponse('**/items/live_scores**');
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await polled;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    await expect(page.locator('.live-now-pill')).toHaveCount(0);
  });

  test('is not shown on /live itself', async ({ page }) => {
    await stubLive(page, VOLLEY_LIVE);
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('.live-score').first()).toBeVisible();
    await expect(page.locator('.live-now-pill')).toHaveCount(0);
  });
});
