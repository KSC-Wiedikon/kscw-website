/**
 * KSCW Live — the public /live page.
 *
 * A vanilla port of wiedisync's `/live` (src/modules/live in the wiedisync repo).
 * The LedBox board in the hall keeps overwriting ONE Directus `live_scores` row
 * per channel; this page polls that row every 3 s and renders it. Both
 * `live_scores` and `live_history` are readable by the Directus Public policy, so
 * there is no login and no token here — the same anonymous REST read wiedisync's
 * spectators use. Keep the rendering in step with wiedisync's VolleyballBoard /
 * BasketballBoard / FinalSummary so the two pages never disagree about a match.
 *
 * ⚠ A board's own row has no `games` foreign key: the board does not always know
 * which fixture it is showing, so nothing here claims "your game is live". Only the
 * referees line looks for the fixture, and it stays away when it cannot be sure.
 */
(function () {
  'use strict';

  var root = document.getElementById('live-root');
  if (!root) return;

  var DIRECTUS_URL = window.__KSCW_DIRECTUS || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch');

  var POLL_MS = 3000;
  var TEAM_FOUL_LIMIT = 5; // FIBA: the 5th team foul puts the OPPONENT in the bonus
  var HISTORY_LIMIT = 8;
  var LIVE_STALE_MS = 20 * 60 * 1000; // wiedisync LIVE_STALE_MS
  var GAME_TTL_MS = 10 * 60 * 1000;

  // ?channel=… picks another physical board; restricted to the characters a
  // channel id can contain, since it ends up in a query string.
  var channel = (new URLSearchParams(window.location.search).get('channel') || 'kscw').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(channel)) channel = 'kscw';

  var els = {
    board: document.getElementById('live-board'),
    status: document.getElementById('live-status'),
    statusLabel: document.getElementById('live-status-label'),
    sport: document.getElementById('live-sport'),
    event: document.getElementById('live-event'),
    updated: document.getElementById('live-updated'),
    referees: document.getElementById('live-referees'),
    refereeNames: document.getElementById('live-referee-names'),
    recent: document.getElementById('live-recent'),
    recentBody: document.getElementById('live-recent-body'),
  };

  /* ── i18n ─────────────────────────────────────────────────── */

  function tr(key, fallback, params) {
    var v = key;
    if (window.i18n && typeof window.i18n.t === 'function') v = window.i18n.t(key, params);
    if (!v || v === key) {
      v = fallback;
      if (params) Object.keys(params).forEach(function (k) { v = v.split('{' + k + '}').join(params[k]); });
    }
    return v;
  }

  /** Fill a node AND keep its key on it, so the engine can repair it later (CLAUDE.md, load order rule 3). */
  function setTr(el, key, fallback) {
    el.setAttribute('data-i18n', key);
    el.textContent = tr(key, fallback);
    return el;
  }

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  /* ── Row normalisation (mirrors wiedisync useLiveMatch.rowToEnvelope) ── */

  function num(v) {
    var n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && isFinite(n) ? n : 0;
  }

  function normaliseSport(v) {
    return v === 'beach' || v === 'basketball' ? v : 'volleyball';
  }

  // Team colours come from the board; only a plain hex ever reaches a style.
  function safeColor(v, fallback) {
    return typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback;
  }

  function readableOn(hex) {
    var hh = hex.replace('#', '');
    var full = hh.length === 3 ? hh.split('').map(function (c) { return c + c; }).join('') : hh;
    var r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111827' : '#ffffff';
  }

  function toMatch(row) {
    var status = row.status === 'live' || row.status === 'final' ? row.status : 'idle';
    if (status === 'idle') return { status: status, event: null, seq: num(row.ts), match: null };
    var sets = Array.isArray(row.set_results) ? row.set_results.map(function (r) { return { a: num(r && r.a), b: num(r && r.b) }; }) : [];
    // A finished match has no next serve: the row keeps its last serving_team, but
    // nobody is serving (or in possession) any more.
    // Same for a score nobody is writing any more.
    var serving = status === 'live' && !staleSince(row) && (row.serving_team === 'left' || row.serving_team === 'right') ? row.serving_team : null;
    var m = {
      sport: normaliseSport(row.sport),
      period: num(row.period),
      serving: serving,
      sets: sets,
    };
    m.a = team(row, 'a', '#2563eb', serving === 'left', num(row.fouls_b) >= TEAM_FOUL_LIMIT);
    m.b = team(row, 'b', '#ef4444', serving === 'right', num(row.fouls_a) >= TEAM_FOUL_LIMIT);
    m.a.isHome = homeIsTeamA(m.sport, m.period, m.a.points, m.b.points);
    m.b.isHome = !m.a.isHome;
    return { status: status, event: row.event || null, seq: num(row.ts), match: m, upNext: isUpNext(row) };
  }

  // Whether team A is home, for a board that sent no full names and so no way to tell by name. The
  // row is always A = left and the teams change ends, so it goes by the set: home starts on the
  // left, every set changes ends, the fifth again at 8 (wiedisync scoreboard.ts homeIsTeamA).
  function homeIsTeamA(sport, period, pointsA, pointsB) {
    if (sport !== 'volleyball') return true;
    var set = Math.max(period, 1);
    if (set === 5 && Math.max(pointsA, pointsB) >= 8) return false;
    return set % 2 === 1;
  }

  // A team on the page: its full name, or Home / Away. Never the board's short code.
  function teamLabel(t) {
    return t.name || (t.isHome ? tr('liveHome', 'Heim') : tr('liveAway', 'Gast'));
  }

  // The board has no warm-up state of its own: from the moment the names go up it
  // publishes 'live', and setup, warm-up and "warm-up finished" all read the same,
  // nothing played yet. The first point (or a timeout) ends it. A row left like that
  // from another day is not "next" any more; a row can sit unchanged through a whole
  // warm-up, so it is the day that counts here, not LIVE_STALE_MS.
  function isUpNext(row) {
    if (row.status !== 'live') return false;
    var played = ['points_a', 'points_b', 'sets_won_a', 'sets_won_b', 'timeouts_a', 'timeouts_b', 'subs_a', 'subs_b', 'fouls_a', 'fouls_b']
      .some(function (k) { return num(row[k]) > 0; });
    if (played || (Array.isArray(row.set_results) && row.set_results.length > 0)) return false;
    return !!row.date_updated && zurichDay(new Date(row.date_updated)) === zurichDay(new Date());
  }

  // When a match left 'live' stopped being written, or null while it still is. Board
  // switched off, no uplink, or a game row the board moved on from: not live any more.
  // Directus only stamps date_updated on an update; a row never updated goes by its ts.
  function staleSince(row) {
    if (row.status !== 'live' || isUpNext(row)) return null;
    var at = row.date_updated ? new Date(row.date_updated).getTime() : num(row.ts);
    return at > 0 && Date.now() - at > LIVE_STALE_MS ? at : null;
  }

  function zurichDay(d) {
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  }

  function team(row, side, fallbackColor, serving, inBonus) {
    var name = row['team_' + side + '_name'] || '';
    return {
      name: name,
      color: safeColor(row['team_' + side + '_color'], fallbackColor),
      points: num(row['points_' + side]),
      sets: num(row['sets_won_' + side]),
      timeouts: num(row['timeouts_' + side]),
      subs: num(row['subs_' + side]),
      fouls: num(row['fouls_' + side]),
      serving: serving,
      inBonus: inBonus,
    };
  }

  /* ── Rendering ────────────────────────────────────────────── */

  function formatTime(ms) {
    return new Date(ms).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Zurich' });
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
      + ' ' + formatTime(d.getTime());
  }

  function teamChip(t, cls) {
    var chip = h('span', cls || 'live-team-chip');
    chip.style.backgroundColor = t.color;
    chip.style.color = readableOn(t.color);
    chip.appendChild(h('span', 'live-team-chip-name', teamLabel(t)));
    return chip;
  }

  function teamIdentity(t, sport) {
    var wrap = h('div', 'live-team-identity');
    var top = h('div', 'live-team-top');
    var chip = teamChip(t);
    // Beach publishes the pair in one field ("Müller / Meier") — stack the players.
    var players = sport === 'beach'
      ? (t.name || '').split(/\s*[/&]\s*/).map(function (p) { return p.trim(); }).filter(Boolean)
      : [];
    if (players.length > 1) {
      var names = chip.firstChild;
      names.textContent = '';
      players.forEach(function (pl) { names.appendChild(h('span', 'live-block', pl)); });
    }
    top.appendChild(chip);
    wrap.appendChild(top);
    return wrap;
  }

  // Points of the previous render, so only a CHANGED score replays the bump.
  var prevPoints = { a: null, b: null };

  function scoreEl(t, side) {
    var el = h('div', 'live-score', t.points);
    if (prevPoints[side] !== null && prevPoints[side] !== t.points) el.classList.add('live-bump');
    prevPoints[side] = t.points;
    return el;
  }

  function volleyColumn(t, side, sport) {
    var col = h('div', 'live-col live-col--' + side);
    var dot = null;
    if (t.serving) {
      dot = h('span', 'live-serve-dot');
      dot.title = tr('liveServing', 'Aufschlag');
      dot.appendChild(h('span', 'sr-only', dot.title));
    }
    col.appendChild(teamIdentity(t, sport));
    // Beside the score, not the name: a dot beside the chip split long names mid-word.
    var scoreRow = h('div', 'live-score-row');
    scoreRow.appendChild(scoreEl(t, side));
    if (dot) scoreRow.appendChild(dot);
    col.appendChild(scoreRow);
    // Beach has no substitutions — "Sub 0" forever would only be noise.
    var meta = tr('liveTimeoutsShort', 'AZ') + ' ' + t.timeouts;
    if (sport !== 'beach') meta += ' · ' + tr('liveSubsShort', 'W') + ' ' + t.subs;
    col.appendChild(h('p', 'live-col-meta', meta));
    return col;
  }

  function currentSetNumber(m) {
    return m.period > 0 ? m.period : m.sets.length + 1;
  }

  function volleyBoard(m) {
    var card = h('div', 'live-board-card');
    if (m.sets.length) {
      var chips = h('div', 'live-set-chips');
      m.sets.forEach(function (r, i) {
        var c = h('span', 'live-set-chip');
        c.title = tr('liveSetN', 'Satz {n}', { n: i + 1 });
        c.appendChild(h('span', r.a > r.b ? 'live-win' : '', r.a));
        c.appendChild(h('span', 'live-sep', ':'));
        c.appendChild(h('span', r.b > r.a ? 'live-win' : '', r.b));
        chips.appendChild(c);
      });
      card.appendChild(chips);
    }
    var grid = h('div', 'live-grid');
    grid.appendChild(volleyColumn(m.a, 'a', m.sport));
    var mid = h('div', 'live-mid');
    mid.appendChild(setTr(h('div', 'live-mid-label'), 'liveSets', 'Sätze'));
    var s = h('div', 'live-mid-value');
    s.appendChild(document.createTextNode(m.a.sets));
    s.appendChild(h('span', 'live-sep', ':'));
    s.appendChild(document.createTextNode(m.b.sets));
    mid.appendChild(s);
    mid.appendChild(h('div', 'live-mid-label', tr('liveSetN', 'Satz {n}', { n: currentSetNumber(m) })));
    grid.appendChild(mid);
    grid.appendChild(volleyColumn(m.b, 'b', m.sport));
    card.appendChild(grid);
    return card;
  }

  // 1..4 = Q1..Q4, 5+ = OT1, OT2, … — same as the board's own periodLabel().
  function periodLabel(p) {
    if (!p || p < 1) return null;
    return p <= 4 ? tr('liveQuarterN', 'V{n}', { n: p }) : tr('liveOvertimeN', 'VL{n}', { n: p - 4 });
  }

  function basketColumn(t, side) {
    var col = h('div', 'live-col live-col--' + side);
    col.appendChild(teamIdentity(t, 'basketball'));
    col.appendChild(scoreEl(t, side));
    col.appendChild(h('p', 'live-col-meta',
      tr('liveFoulsShort', 'Fouls') + ' ' + t.fouls + ' · ' + tr('liveTimeoutsShort', 'AZ') + ' ' + t.timeouts));
    var bonusRow = h('div', 'live-bonus-row');
    if (t.inBonus) {
      var b = setTr(h('span', 'live-bonus'), 'liveBonus', 'Bonus');
      b.title = tr('liveBonusHint', 'Im Bonus');
      bonusRow.appendChild(b);
    }
    col.appendChild(bonusRow);
    return col;
  }

  function basketBoard(m) {
    var card = h('div', 'live-board-card');
    var grid = h('div', 'live-grid');
    grid.appendChild(basketColumn(m.a, 'a'));
    var mid = h('div', 'live-mid');
    mid.appendChild(setTr(h('div', 'live-mid-label'), 'livePeriod', 'Viertel'));
    mid.appendChild(h('div', 'live-mid-value', periodLabel(m.period) || '—'));
    // serving_team doubles as the possession arrow — same left/right semantics.
    var arrow = h('div', 'live-possession');
    if (m.serving) {
      arrow.appendChild(h('span', '', m.serving === 'left' ? '◀' : '▶')).setAttribute('aria-hidden', 'true');
      arrow.appendChild(h('span', 'sr-only',
        tr('livePossessionOf', 'Ballbesitz: {team}', { team: teamLabel(m.serving === 'left' ? m.a : m.b) })));
    }
    mid.appendChild(arrow);
    grid.appendChild(mid);
    grid.appendChild(basketColumn(m.b, 'b'));
    card.appendChild(grid);
    return card;
  }

  function finalSummary(m) {
    var bySets = m.sport !== 'basketball';
    var sa = bySets ? m.a.sets : m.a.points;
    var sb = bySets ? m.b.sets : m.b.points;
    var winner = sa > sb ? m.a : sb > sa ? m.b : null;

    var card = h('div', 'live-final');
    card.appendChild(setTr(h('div', 'live-mid-label'), 'liveStatusFinal', 'Beendet'));
    var line = h('p', 'live-final-line');
    if (winner) {
      line.appendChild(teamChip(winner, 'live-team-chip live-team-chip--sm'));
      line.appendChild(setTr(h('span'), 'liveWonMatch', 'gewinnt das Spiel'));
    } else {
      setTr(line, 'liveFinalNoWinner', 'Spiel endet unentschieden');
    }
    card.appendChild(line);
    var score = h('p', 'live-final-score');
    score.appendChild(document.createTextNode(sa));
    score.appendChild(h('span', 'live-sep', ':'));
    score.appendChild(document.createTextNode(sb));
    card.appendChild(score);
    card.appendChild(bySets ? setTr(h('p', 'live-mid-label'), 'liveSets', 'Sätze') : setTr(h('p', 'live-mid-label'), 'livePoints', 'Punkte'));
    return card;
  }

  // The fixture's names when the game is known (home first, as typed by the league),
  // else the board's. The time only for a game today: "(scheduled: 16:00)" says today.
  function upNextCard(m) {
    var game = fixture.game;
    var card = h('div', 'live-next');
    card.appendChild(setTr(h('p', 'live-mid-label'), 'liveUpNext', 'Als Nächstes'));
    var line = h('p', 'live-next-match', (game && game.home_team || teamLabel(m.a)) + ' – ' + (game && game.away_team || teamLabel(m.b)));
    var time = game && game.time && game.date === zurichDay(new Date()) ? String(game.time).slice(0, 5) : '';
    if (time) {
      line.appendChild(document.createTextNode(' '));
      line.appendChild(h('span', 'live-next-time', tr('liveScheduledAt', '(geplant: {time})', { time: time })));
    }
    card.appendChild(line);
    return card;
  }

  function emptyState() {
    var card = h('div', 'live-empty');
    card.appendChild(setTr(h('p', 'live-empty-title'), 'liveNoMatch', 'Zurzeit kein Live-Spiel'));
    card.appendChild(setTr(h('p', 'live-empty-hint'), 'liveNoMatchHint', 'Diese Seite aktualisiert sich automatisch, sobald die Anzeigetafel ein Spiel startet.'));
    // A game's own link with nothing on it: the match may well be on the hall's scoreboard.
    if (channel !== 'kscw') {
      var toBoard = setTr(h('a', 'live-to-board'), 'liveToBoard', 'Zur Anzeigetafel');
      toBoard.href = '/live';
      card.appendChild(toBoard);
    }
    return card;
  }

  var STATUS = {
    live: ['liveStatusLive', 'Live'],
    final: ['liveStatusFinal', 'Beendet'],
    idle: ['liveStatusIdle', 'Kein Live-Spiel'],
    pending: ['liveStatusConnecting', 'Verbinden…'],
    reconnecting: ['liveStatusReconnecting', 'Neu verbinden…'],
  };
  var SPORT = {
    volleyball: ['liveSportVolleyball', 'Volleyball'],
    beach: ['liveSportBeach', 'Beachvolleyball'],
    basketball: ['liveSportBasketball', 'Basketball'],
  };
  var EVENT = {
    'set-end': ['liveEventSetEnd', 'Satz beendet'],
    'match-end': ['liveEventMatchEnd', 'Spiel beendet'],
    'switch-8': ['liveEventSwitch', 'Seitenwechsel'],
  };

  var state = { snap: null, connection: 'connecting', lastSeq: -1, lastAt: null, key: '', stale: null };
  var fixture = { key: '', at: 0, game: null };

  function renderStatus() {
    var tone;
    if (!state.snap || state.connection === 'reconnecting') tone = state.connection === 'reconnecting' ? 'reconnecting' : 'pending';
    else tone = state.snap.upNext || state.stale ? 'idle' : state.snap.status;
    var s = STATUS[tone];
    els.status.setAttribute('data-tone', tone === 'reconnecting' ? 'pending' : tone);
    setTr(els.statusLabel, s[0], s[1]);
  }

  function render() {
    renderStatus();
    var snap = state.snap;
    if (!snap) return; // keep the server-rendered placeholder until the first read

    var m = snap.match;
    // Turned sideways, a running match fills the screen (data.css; wiedisync LivePage).
    root.classList.toggle('live-fullscreen', !!m && snap.status === 'live' && !snap.upNext && !state.stale);
    els.board.textContent = '';
    if (m) {
      if (snap.status === 'final') els.board.appendChild(finalSummary(m));
      if (snap.upNext) els.board.appendChild(upNextCard(m));
      else els.board.appendChild(m.sport === 'basketball' ? basketBoard(m) : volleyBoard(m));
      setTr(els.sport, SPORT[m.sport][0], SPORT[m.sport][1]);
      els.sport.hidden = false;
    } else {
      prevPoints = { a: null, b: null };
      els.board.appendChild(emptyState());
      els.sport.hidden = true;
    }

    var ev = m && snap.event && EVENT[snap.event];
    if (ev) { setTr(els.event, ev[0], ev[1]); els.event.hidden = false; }
    else { els.event.hidden = true; els.event.removeAttribute('data-i18n'); }

    els.updated.textContent = updatedText(m);
  }

  function updatedText(m) {
    if (!m) return '';
    if (state.stale) return tr('liveNoUpdatesSince', 'Keine neuen Daten seit {time}', { time: formatTime(state.stale) });
    return state.lastAt ? tr('liveUpdatedAt', 'Aktualisiert {time}', { time: formatTime(state.lastAt) }) : '';
  }

  /* ── Data ─────────────────────────────────────────────────── */

  function getJSON(path) {
    return fetch(DIRECTUS_URL + path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (j && j.data) || []; });
  }

  function fetchRow() {
    return getJSON('/items/live_scores?limit=1&filter[channel][_eq]=' + encodeURIComponent(channel));
  }

  function apply(rows) {
    var row = rows[0];
    var snap = row ? toMatch(row) : { status: 'idle', event: null, seq: 0, match: null };
    if (row && snap.seq && snap.seq < state.lastSeq) return; // out-of-order frame
    var prevStatus = state.snap && state.snap.status;
    state.lastSeq = snap.seq;
    state.connection = 'open';
    // Only repaint when the board actually changed — every 3 s otherwise rebuilds
    // an identical DOM. The "updated" time still ticks via lastAt below.
    var key = JSON.stringify(row || null);
    state.lastAt = Date.now();
    loadGame(row, snap);
    // Going stale changes nothing in the row, only the time since it was written.
    var stale = (row && staleSince(row)) || null;
    if (key !== state.key || stale !== state.stale) {
      state.key = key;
      state.snap = snap;
      state.stale = stale;
      render();
    } else {
      renderStatus();
      els.updated.textContent = updatedText(snap.match);
    }
    // A match just ended → it is now in live_history; refresh the list.
    if (snap.status === 'final' && prevStatus && prevStatus !== 'final') loadHistory();
  }

  function fail() {
    state.connection = state.snap ? 'reconnecting' : 'connecting';
    renderStatus();
  }

  function poll() {
    if (document.visibilityState === 'hidden') return;
    fetchRow().then(apply, fail);
  }

  function loadHistory() {
    // A game's own channel (`game-<id>`) lists that game's archived match: the board
    // archives on its own channel, with the game's id when it knew it (wiedisync
    // migration 425). Any other channel is that board's log.
    var game = /^game-(\d+)$/.exec(channel);
    var q = '/items/live_history?limit=' + HISTORY_LIMIT + '&sort=-finished_at'
      + '&fields=id,sport,team_a_short,team_a_name,team_b_short,team_b_name,points_a,points_b,sets_won_a,sets_won_b,set_results,finished_at'
      + (game ? '&filter[game_id][_eq]=' + game[1] : '&filter[channel][_eq]=' + encodeURIComponent(channel));
    getJSON(q).then(function (rows) {
      els.recentBody.textContent = '';
      rows.forEach(function (r) {
        var bySets = normaliseSport(r.sport) !== 'basketball';
        var tr_ = document.createElement('tr');
        tr_.appendChild(h('td', 'live-recent-match',
          (r.team_a_name || r.team_a_short || '—') + ' – ' + (r.team_b_name || r.team_b_short || '—')));
        tr_.appendChild(h('td', 'live-num',
          bySets ? num(r.sets_won_a) + ':' + num(r.sets_won_b) : num(r.points_a) + ':' + num(r.points_b)));
        var sets = Array.isArray(r.set_results) ? r.set_results.map(function (s) { return num(s && s.a) + ':' + num(s && s.b); }).join(', ') : '';
        tr_.appendChild(h('td', 'live-num live-muted live-hide-sm', sets || '—'));
        tr_.appendChild(h('td', 'live-num live-muted', r.finished_at ? formatDateTime(r.finished_at) : '—'));
        els.recentBody.appendChild(tr_);
      });
      els.recent.hidden = rows.length === 0;
    }, function () { /* best-effort: no history → no section */ });
  }

  /* ── The game on the board (mirrors wiedisync useLiveGame + liveGame) ── */

  function normaliseTeamName(name) {
    return String(name == null ? '' : name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Either order: the board's left side is not always the home team.
  function sameTeams(a1, b1, a2, b2) {
    var x1 = normaliseTeamName(a1), y1 = normaliseTeamName(b1);
    var x2 = normaliseTeamName(a2), y2 = normaliseTeamName(b2);
    if (!x1 || !y1) return false;
    return (x1 === x2 && y1 === y2) || (x1 === y2 && y1 === x2);
  }

  function refereeNames(raw) {
    var list = raw;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch (e) { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list
      .map(function (r) { return r && typeof r === 'object' ? String(r.name == null ? '' : r.name).trim() : ''; })
      .filter(Boolean);
  }

  // Which game, in order:
  //  1. the row's own `game_id` (a `game-<id>` row);
  //  2. for a board's own channel, the game row that board mirrors right now, but
  //     only if it holds these two teams: the row of the previous match stays fresh
  //     for a while after the next one is on the board;
  //  3. today's one game with these two teams. Null when two match: a guess would
  //     put the wrong referees on the page.
  function findGame(row) {
    var fields = 'fields=date,time,home_team,away_team,referees_json';
    function byId(id) { return getJSON('/items/games/' + encodeURIComponent(id) + '?' + fields); }
    if (row.game_id != null) return byId(row.game_id);

    // _nnull: a row never updated has no date, and a descending sort puts it first.
    var mirror = '/items/live_scores?limit=1&sort=-date_updated&fields=game_id,team_a_name,team_b_name,date_updated'
      + '&filter[date_updated][_nnull]=true&filter[source][_eq]=' + encodeURIComponent('board:' + channel);
    return getJSON(mirror).then(function (rows) {
      var m = rows[0];
      var fresh = m && m.game_id != null && Date.now() - new Date(m.date_updated).getTime() <= LIVE_STALE_MS;
      if (fresh && sameTeams(row.team_a_name, row.team_b_name, m.team_a_name, m.team_b_name)) return byId(m.game_id);

      var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
      return getJSON('/items/games?limit=50&' + fields + '&filter[date][_eq]=' + today).then(function (games) {
        var hits = games.filter(function (g) { return sameTeams(row.team_a_name, row.team_b_name, g.home_team, g.away_team); });
        return hits.length === 1 ? hits[0] : null;
      });
    });
  }

  function showReferees(names) {
    els.refereeNames.textContent = names.join(' · ');
    els.referees.hidden = names.length === 0;
  }

  // Read once per match, not on every point; the re-read picks up a late sync.
  function loadGame(row, snap) {
    var key = snap.match ? [row.game_id, row.team_a_name, row.team_b_name].join('|') : '';
    if (key === fixture.key && (!key || Date.now() - fixture.at < GAME_TTL_MS)) return;
    if (key !== fixture.key) { // never the previous match's game
      fixture.game = null;
      showReferees([]);
    }
    fixture.key = key;
    fixture.at = Date.now();
    if (!key) return;
    findGame(row).then(function (game) {
      if (fixture.key !== key) return;
      fixture.game = game;
      showReferees(refereeNames(game && game.referees_json));
      if (state.snap && state.snap.upNext) render();
    }, function () { /* best-effort: no game → no referees, no scheduled time */ });
  }

  // Rule 2: await the dictionary before RENDERING, never before FETCHING.
  var ready = window.i18nReady && window.i18nReady.then ? window.i18nReady.catch(function () {}) : Promise.resolve();
  Promise.all([fetchRow(), ready]).then(function (res) { apply(res[0]); }, fail);
  ready.then(loadHistory);

  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') poll();
  });
  // Parameterised strings ("Satz 3", "Aktualisiert 20:14") carry no data-i18n key,
  // so repaint on a language switch and on the engine's load-time pass.
  document.addEventListener('langChanged', render);
  document.addEventListener('i18nApplied', render);
})();
