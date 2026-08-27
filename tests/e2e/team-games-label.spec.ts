/**
 * A team page's game rows name our own side with the team short ("KSCW H3").
 *
 * The rows used to read a bare "KSCW vs …". On mobile the home/away badge and
 * the team chip are both hidden, so once the reader has scrolled past the hero
 * a row no longer said which of the club's teams it belonged to — and a fixture
 * between two club teams read "KSC Wiedikon H1 vs KSCW", with the same club
 * spelled two different ways in one line.
 *
 * The endpoint is stubbed so the assertion is on the rendering, not on whatever
 * Swiss Volley has published this week.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const TEAM = {
  data: {
    id: 92, team_id: 'vb_1', name: 'H3', full_name: 'KSC Wiedikon H3',
    sport: 'volleyball', league: 'Herren 4. Liga', season: '2026/27',
    color: '#4a55a2', active: true, team_picture: null, social_url: null,
    roster: [], coaches: [], upcoming_trainings: [], rankings: [], sponsors: [],
    upcoming_games: [
      { game_id: 'g1', date: '2030-10-02', time: '20:00:00', type: 'home',
        home_team: 'KSC Wiedikon H3', away_team: 'VBC Wetzikon H1',
        home_score: null, away_score: null, league: 'Herren 4. Liga' },
      { game_id: 'g2', date: '2030-10-09', time: '20:45:00', type: 'away',
        home_team: 'VBC Swiss', away_team: 'KSC Wiedikon H3',
        home_score: null, away_score: null, league: 'Herren 4. Liga' },
      { game_id: 'g3', date: '2030-10-16', time: '20:00:00', type: 'away',
        home_team: 'KSC Wiedikon H1', away_team: 'KSC Wiedikon H3',
        home_score: null, away_score: null, league: 'Herren 4. Liga' },
    ],
    results: [],
  },
};

async function stubTeam(page: Page) {
  await page.route('**/kscw/public/team/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(TEAM),
  }));
}

test('every row carries the club short of the team whose page it is', async ({ page }) => {
  await stubTeam(page);
  await gotoWithLang(page, '/volleyball/h3', 'de');

  const rows = page.locator('#upcoming-games .gt-matchup');
  await expect(rows).toHaveCount(3, { timeout: 25_000 });
  await expect(rows.nth(0)).toHaveText('KSCW H3 vs VBC Wetzikon H1');
  await expect(rows.nth(1)).toHaveText('VBC Swiss vs KSCW H3');
  // Both sides of a club derby are spelled the same way.
  await expect(rows.nth(2)).toHaveText('KSCW H1 vs KSCW H3');
});
