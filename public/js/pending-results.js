/**
 * KSCW pending results — played games whose official result has not synced yet.
 *
 * A game stays `scheduled` (with a 0:0 placeholder score) until the Swiss Volley /
 * ProBasket sync writes the result, which can lag the final whistle by a day or
 * more. The result lists used to filter on `completed` only, so a game played
 * yesterday was in neither list. They now include past `scheduled` games (same
 * rule as wiedisync's Results tab), and fill in the score the hall's LedBox
 * scoreboard recorded when there is one.
 *
 * The live score is PROVISIONAL: only `scheduled` games are looked up here, so the
 * moment the sync marks a game `completed` its official score wins and this file
 * no longer touches it.
 *
 * `live_history` (public read, see live.js) has no link to the fixture, so a row is
 * matched to a game by Europe/Zurich date + both team names. (`live_match_logs`
 * carries a `game_id`, but is not readable anonymously on prod.)
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';

  function zurichDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  }

  function zurichHour(iso) {
    return parseInt(new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false }), 10);
  }

  function nextDay(ymd) {
    var d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // Swiss Volley writes "KSC Wiedikon H1", the board "KSC WIEDIKON H1" / "KSCW H1".
  function norm(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^kscw\b/, 'ksc wiedikon');
  }

  function sameTeam(gameName, row, side) {
    var g = norm(gameName);
    if (!g) return false;
    return g === norm(row['team_' + side + '_name']) || g === norm(row['team_' + side + '_short']);
  }

  function num(v) {
    var n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && isFinite(n) ? n : 0;
  }

  /** live_history rows finished on or after `sinceDate` (YYYY-MM-DD), newest first. Never rejects. */
  function loadLive(sinceDate) {
    var filter = { finished_at: { _gte: sinceDate } };
    var url = DIRECTUS_URL + '/items/live_history?limit=200&sort=-finished_at'
      + '&fields=sport,team_a_name,team_a_short,team_b_name,team_b_short,points_a,points_b,sets_won_a,sets_won_b,set_results,finished_at'
      + '&filter=' + encodeURIComponent(JSON.stringify(filter));
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : { data: [] }; })
      .then(function (j) { return (j && j.data) || []; })
      .catch(function () { return []; });
  }

  /**
   * The board's score for a game, oriented home/away, or null.
   * `game`: { date: 'YYYY-MM-DD', homeTeam, awayTeam, sport }.
   * Returns { home, away, sets: [{ home, away }] }.
   */
  function liveScore(game, rows) {
    if (!game || !game.date || !rows || !rows.length) return null;
    var day = String(game.date).slice(0, 10);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.finished_at) continue;
      var fin = zurichDate(r.finished_at);
      // A late game can finish after midnight.
      if (fin !== day && !(fin === nextDay(day) && zurichHour(r.finished_at) < 4)) continue;
      var straight = sameTeam(game.homeTeam, r, 'a') && sameTeam(game.awayTeam, r, 'b');
      var swapped = sameTeam(game.homeTeam, r, 'b') && sameTeam(game.awayTeam, r, 'a');
      if (!straight && !swapped) continue;

      var basketball = r.sport === 'basketball' || game.sport === 'basketball';
      var a = basketball ? num(r.points_a) : num(r.sets_won_a);
      var b = basketball ? num(r.points_b) : num(r.sets_won_b);
      var sets = basketball || !Array.isArray(r.set_results) ? [] : r.set_results.map(function (s) {
        return straight ? { home: num(s && s.a), away: num(s && s.b) } : { home: num(s && s.b), away: num(s && s.a) };
      });
      return straight ? { home: a, away: b, sets: sets } : { home: b, away: a, sets: sets };
    }
    return null;
  }

  window.KSCWPendingResults = { loadLive: loadLive, liveScore: liveScore };
})();
