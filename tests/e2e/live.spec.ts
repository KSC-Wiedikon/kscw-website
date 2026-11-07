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

// `games` holds what /items/games answers; `mirror` is the board's own game row.
async function stubGames(page: Page, games: object[], mirror: object | null = null) {
  await page.route('**/items/games**', (route) => {
    const byId = /\/items\/games\/(\d+)/.exec(route.request().url());
    const data = byId ? games.find((g) => String((g as { id: number }).id) === byId[1]) : games;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  if (mirror) {
    await page.route(/\/items\/live_scores\?.*source/, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [mirror] }),
    }));
  }
}

async function stubLive(page: Page, row: object | null, history: object[] = []) {
  await page.route('**/items/live_scores**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: row ? [row] : [] }),
  }));
  await page.route('**/items/live_history**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: history }),
  }));
}

const H1_GAME = {
  id: 472, home_team: 'KSC Wiedikon H1', away_team: 'KSC Wiedikon H3',
  referees_json: [{ name: 'Erste Pfeiferin', id: 1 }, { name: 'Zweiter Pfeifer', id: 2 }],
};
const D1_GAME = {
  id: 437, home_team: 'KSC Wiedikon D1', away_team: 'VBC Nord D1',
  referees_json: [{ name: 'Dritte Pfeiferin', id: 3 }],
};

test.describe('/live referees', () => {
  test("a game channel shows its game's referees and translates the label", async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, channel: 'game-472', game_id: 472 });
    await stubGames(page, [H1_GAME]);
    await gotoWithLang(page, '/live?channel=game-472', 'de');

    const line = page.locator('#live-referees');
    await expect(line).toHaveText('Schiedsrichter: Erste Pfeiferin · Zweiter Pfeifer');
    await switchLangTo(page, 'en');
    await expect(line).toHaveText('Referees: Erste Pfeiferin · Zweiter Pfeifer');
  });

  test("a board's channel finds today's game by its teams, in either order", async ({ page }) => {
    await stubLive(page, {
      ...VOLLEY_LIVE, team_a_name: 'KSC WIEDIKON H3', team_b_name: 'KSC WIEDIKON H1',
    });
    await stubGames(page, [D1_GAME, H1_GAME]);
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('#live-referee-names')).toHaveText('Erste Pfeiferin · Zweiter Pfeifer');
  });

  test("the previous match's row on the board does not lend its referees", async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, team_a_name: 'KSC WIEDIKON D1', team_b_name: 'VBC NORD D1' });
    await stubGames(page, [D1_GAME, H1_GAME], {
      game_id: 472, team_a_name: 'KSC WIEDIKON H1', team_b_name: 'KSC WIEDIKON H3',
      date_updated: new Date().toISOString(),
    });
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('#live-referee-names')).toHaveText('Dritte Pfeiferin');
  });

  test('two games with the same teams show no line rather than a guess', async ({ page }) => {
    const seen = page.waitForRequest('**/items/games**');
    await stubLive(page, VOLLEY_LIVE);
    await stubGames(page, [H1_GAME, { ...H1_GAME, id: 473 }]);
    await gotoWithLang(page, '/live', 'de');
    await seen;
    await expect(page.locator('#live-board .live-score')).toHaveText(['12', '9']);
    await expect(page.locator('#live-referees')).toBeHidden();
  });

  test('referees come from the data, never as markup', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, channel: 'game-472', game_id: 472 });
    await stubGames(page, [{ ...H1_GAME, referees_json: [{ name: '<img src=x onerror=alert(1)>', id: 1 }] }]);
    await gotoWithLang(page, '/live?channel=game-472', 'de');
    await expect(page.locator('#live-referee-names')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#live-referee-names img')).toHaveCount(0);
  });
});

test.describe('/live up next', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  const READY = {
    ...VOLLEY_LIVE, event: null, period: 1,
    team_a_name: 'KSC WIEDIKON D1', team_b_name: 'VBC NORD D1',
    points_a: 0, points_b: 0, sets_won_a: 0, sets_won_b: 0,
    timeouts_a: 0, timeouts_b: 0, subs_a: 0, subs_b: 0, set_results: [],
    date_updated: new Date().toISOString(),
  };
  const GAME = { ...D1_GAME, date: today, time: '16:00:00' };

  test('a match set up but not started reads as up next, with the scheduled time', async ({ page }) => {
    await stubLive(page, READY);
    await stubGames(page, [GAME]);
    await gotoWithLang(page, '/live', 'de');

    const card = page.locator('.live-next');
    await expect(card).toContainText('Als Nächstes');
    await expect(card.locator('.live-next-match')).toHaveText('KSC Wiedikon D1 – VBC Nord D1 (geplant: 16:00)');
    await expect(page.locator('#live-board .live-score')).toHaveCount(0);
    await expect(page.locator('#live-status')).toHaveAttribute('data-tone', 'idle');
    await expect(page.locator('#live-referee-names')).toHaveText('Dritte Pfeiferin');

    await switchLangTo(page, 'en');
    await expect(card).toContainText('Up next');
    await expect(card.locator('.live-next-match')).toHaveText('KSC Wiedikon D1 – VBC Nord D1 (scheduled: 16:00)');
  });

  test('without a known game it names the board teams and no time', async ({ page }) => {
    await stubLive(page, READY);
    await stubGames(page, []);
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('.live-next-match')).toHaveText('KSC WIEDIKON D1 – VBC NORD D1');
  });

  test('a game on another day keeps its names but not its time', async ({ page }) => {
    await stubLive(page, { ...READY, channel: 'game-437', game_id: 437 });
    await stubGames(page, [{ ...GAME, date: '2020-01-01' }]);
    await gotoWithLang(page, '/live?channel=game-437', 'de');
    await expect(page.locator('.live-next-match')).toHaveText('KSC Wiedikon D1 – VBC Nord D1');
  });

  test('the first point turns it into the board', async ({ page }) => {
    let row: object = READY;
    await stubLive(page, READY);
    await stubGames(page, [GAME]);
    await page.route('**/items/live_scores**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [row] }),
    }));
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('.live-next')).toBeVisible();

    row = { ...READY, points_a: 1 };
    await expect(page.locator('#live-board .live-score')).toHaveText(['1', '0']);
    await expect(page.locator('.live-next')).toHaveCount(0);
    await expect(page.locator('#live-status')).toHaveAttribute('data-tone', 'live');
  });

  test('a 0:0 row left over from another day is not up next', async ({ page }) => {
    await stubLive(page, { ...READY, date_updated: '2026-09-23T16:37:51.154Z' });
    await stubGames(page, []);
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('#live-board .live-score')).toHaveText(['0', '0']);
    await expect(page.locator('.live-next')).toHaveCount(0);
  });
});

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

  test('a finished match shows no serve dot', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, status: 'final', event: 'match-end', sets_won_a: 3, sets_won_b: 0, serving_team: 'left' });
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('.live-final')).toBeVisible();
    await expect(page.locator('.live-serve-dot')).toHaveCount(0);
  });

  test('a finished basketball game shows no possession arrow', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, sport: 'basketball', status: 'final', event: 'match-end', points_a: 71, points_b: 64, serving_team: 'left' });
    await gotoWithLang(page, '/live', 'de');
    await expect(page.locator('.live-final')).toBeVisible();
    await expect(page.locator('.live-possession')).toBeEmpty();
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
  // The pill skips a row nobody wrote for 20 minutes (a board switched off mid-match),
  // so its live rows are stamped "just now"; VOLLEY_LIVE's fixed date would read as stale.
  const fresh = (row: object) => ({ ...row, date_updated: new Date().toISOString() });

  test('appears site-wide while a match is live and links to /live', async ({ page }) => {
    await stubLive(page, fresh(VOLLEY_LIVE));
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    const pill = page.locator('.live-now-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('href', '/live');
    await expect(pill).toContainText('KSCW H1 12 : 9 KSCW H3');
  });

  test("a game's own row links to that game's channel", async ({ page }) => {
    await stubLive(page, fresh({ ...VOLLEY_LIVE, channel: 'game-455', source: 'board:kscw' }));
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await expect(page.locator('.live-now-pill')).toHaveAttribute('href', '/live?channel=game-455');
  });

  test('stays away when the live row has not changed for 20 minutes', async ({ page }) => {
    await stubLive(page, { ...VOLLEY_LIVE, date_updated: new Date(Date.now() - 21 * 60 * 1000).toISOString() });
    const polled = page.waitForResponse('**/items/live_scores**');
    await gotoWithLang(page, '/club/ueber-uns', 'de');
    await polled;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    await expect(page.locator('.live-now-pill')).toHaveCount(0);
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
