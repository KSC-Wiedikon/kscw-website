/**
 * The hall board writes a game's own live row (`game-<games.id>`, home/away) next to its
 * channel row, and archives a match it could tie to its fixture with `game_id`
 * (wiedisync migration 425). Two public scripts read them:
 *
 *  - public/js/live-now.js — the "Live now" pill: every live row, rows quiet for 20 min
 *    dropped, the board's own row dropped when its game row mirrors it, link to the
 *    channel. Same rules as wiedisync's src/modules/live/liveNow.ts.
 *  - public/js/pending-results.js — an unsynced game's provisional score: the history
 *    row with the game's id first, else date + team names as before.
 *
 * Both are ES5 IIFEs, loaded here the way a browser would.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Row = Record<string, unknown>;

function load(file: string, extra: Record<string, unknown> = {}) {
  const src = readFileSync(resolve(process.cwd(), 'public/js', file), 'utf8');
  const window: Record<string, unknown> = { location: { hostname: 'kscw.ch', pathname: '/' }, ...extra };
  const document = {
    visibilityState: 'hidden', // the first poll returns before fetching
    addEventListener() {},
    createElement() { return {}; },
    body: { appendChild() {} },
  };
  const fetch = () => new Promise(() => {});
  new Function('window', 'document', 'fetch', 'setInterval', src)(window, document, fetch, () => 0);
  return window;
}

const live = load('live-now.js').KSCWLiveNow as {
  pick: (rows: Row[] | null, now: number) => Row | null;
  hrefFor: (channel: string) => string;
};
const pending = load('pending-results.js').KSCWPendingResults as {
  liveScore: (game: Row, rows: Row[]) => { home: number; away: number; sets: Array<{ home: number; away: number }> } | null;
};

const NOW = Date.UTC(2026, 9, 23, 19, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const liveRow = (over: Row): Row => ({
  channel: 'kscw', status: 'live', team_a_short: 'KSCW', team_b_short: 'VBCE',
  points_a: 10, points_b: 8, date_updated: ago(30_000), source: null, ...over,
});

describe('live-now.js pick', () => {
  it('nothing live, final, or quiet for 20 minutes → no pill', () => {
    expect(live.pick([], NOW)).toBeNull();
    expect(live.pick([liveRow({ status: 'final' })], NOW)).toBeNull();
    expect(live.pick([liveRow({ date_updated: ago(20 * 60 * 1000 + 1) })], NOW)).toBeNull();
  });

  it('a phone-scored game shows, and links to its channel', () => {
    const row = live.pick([liveRow({ channel: 'game-455', source: 'phone' })], NOW);
    expect(row?.channel).toBe('game-455');
    expect(live.hrefFor('game-455')).toBe('/live?channel=game-455');
    expect(live.hrefFor('kscw')).toBe('/live');
  });

  it("the board's own row is dropped when its game row mirrors it", () => {
    const row = live.pick([
      liveRow({ channel: 'kscw', date_updated: ago(1000) }),
      liveRow({ channel: 'game-455', source: 'board:kscw', date_updated: ago(2000) }),
    ], NOW);
    expect(row?.channel).toBe('game-455');
  });
});

const hist = (over: Row): Row => ({
  sport: 'volleyball', team_a_name: 'KSC WIEDIKON H3', team_a_short: 'KSCW H3',
  team_b_name: 'VBC EINSIEDELN H1', team_b_short: 'VBCE', sets_won_a: 3, sets_won_b: 1,
  set_results: [{ a: 25, b: 20 }, { a: 22, b: 25 }, { a: 25, b: 18 }, { a: 25, b: 23 }],
  finished_at: '2026-10-23T19:40:00Z', game_id: null, ...over,
});
const GAME = { ids: [455], date: '2026-10-23', homeTeam: 'KSC Wiedikon H3', awayTeam: 'VBC Einsiedeln H1', sport: 'volleyball' };

describe('pending-results.js liveScore', () => {
  it("the row with the game's id wins, home/away as archived", () => {
    // Names that would not match at all: the id decides.
    const s = pending.liveScore(GAME, [hist({ game_id: 455, team_a_name: 'HOME', team_a_short: 'H', team_b_name: 'AWAY', team_b_short: 'A' })]);
    expect(s).toEqual({ home: 3, away: 1, sets: [{ home: 25, away: 20 }, { home: 22, away: 25 }, { home: 25, away: 18 }, { home: 25, away: 23 }] });
  });

  it("a row tied to another game is never read by names", () => {
    expect(pending.liveScore(GAME, [hist({ game_id: 999 })])).toBeNull();
  });

  it('a row without an id still matches by date and names, either orientation', () => {
    expect(pending.liveScore(GAME, [hist({})])?.home).toBe(3);
    const swapped = hist({
      team_a_name: 'VBC EINSIEDELN H1', team_a_short: 'VBCE', team_b_name: 'KSC WIEDIKON H3', team_b_short: 'KSCW H3',
      sets_won_a: 1, sets_won_b: 3, set_results: [{ a: 20, b: 25 }],
    });
    expect(pending.liveScore(GAME, [swapped])).toEqual({ home: 3, away: 1, sets: [{ home: 25, away: 20 }] });
  });

  it('a derby merged on the home page matches either of its two ids', () => {
    expect(pending.liveScore({ ...GAME, ids: [800, 801] }, [hist({ game_id: 800 })])?.home).toBe(3);
  });

  it('callers that pass no ids keep the old matching', () => {
    const { ids: _ids, ...noIds } = GAME;
    expect(pending.liveScore(noIds, [hist({ game_id: 455 })])?.home).toBe(3);
  });
});
