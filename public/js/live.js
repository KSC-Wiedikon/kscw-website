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
 * ⚠ The row has no `games` foreign key: the board does not know which fixture it
 * is showing, so nothing here claims "your game is live".
 */
(function () {
  'use strict';

  var root = document.getElementById('live-root');
  if (!root) return;

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';

  var POLL_MS = 3000;
  var TEAM_FOUL_LIMIT = 5; // FIBA: the 5th team foul puts the OPPONENT in the bonus
  var HISTORY_LIMIT = 8;

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
    var m = {
      sport: normaliseSport(row.sport),
      period: num(row.period),
      serving: row.serving_team === 'left' || row.serving_team === 'right' ? row.serving_team : null,
      sets: sets,
    };
    m.a = team(row, 'a', '#2563eb', row.serving_team === 'left', num(row.fouls_b) >= TEAM_FOUL_LIMIT);
    m.b = team(row, 'b', '#ef4444', row.serving_team === 'right', num(row.fouls_a) >= TEAM_FOUL_LIMIT);
    return { status: status, event: row.event || null, seq: num(row.ts), match: m };
  }

  function team(row, side, fallbackColor, serving, inBonus) {
    var name = row['team_' + side + '_name'] || '';
    return {
      name: name,
      short: row['team_' + side + '_short'] || name,
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
    chip.appendChild(h('span', 'live-truncate', t.short || tr('liveTeamFallback', 'Team')));
    return chip;
  }

  function teamIdentity(t, sport, indicator) {
    var wrap = h('div', 'live-team-identity');
    var top = h('div', 'live-team-top');
    top.appendChild(teamChip(t));
    if (indicator) top.appendChild(indicator);
    wrap.appendChild(top);

    // Beach publishes the pair in one field ("Müller / Meier") — stack the players.
    var players = sport === 'beach'
      ? (t.name || '').split(/\s*[/&]\s*/).map(function (p) { return p.trim(); }).filter(Boolean)
      : [];
    if (players.length > 1) {
      var p = h('p', 'live-team-name');
      players.forEach(function (pl) { p.appendChild(h('span', 'live-truncate live-block', pl)); });
      wrap.appendChild(p);
    } else if (t.name && t.name !== t.short) {
      wrap.appendChild(h('p', 'live-team-name live-truncate', t.name));
    }
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
    col.appendChild(teamIdentity(t, sport, dot));
    col.appendChild(scoreEl(t, side));
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
    col.appendChild(teamIdentity(t, 'basketball', null));
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
        tr('livePossessionOf', 'Ballbesitz: {team}', { team: (m.serving === 'left' ? m.a : m.b).short })));
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

  function emptyState() {
    var card = h('div', 'live-empty');
    card.appendChild(setTr(h('p', 'live-empty-title'), 'liveNoMatch', 'Zurzeit kein Live-Spiel'));
    card.appendChild(setTr(h('p', 'live-empty-hint'), 'liveNoMatchHint', 'Diese Seite aktualisiert sich automatisch, sobald die Anzeigetafel ein Spiel startet.'));
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

  var state = { snap: null, connection: 'connecting', lastSeq: -1, lastAt: null, key: '' };

  function renderStatus() {
    var tone;
    if (!state.snap || state.connection === 'reconnecting') tone = state.connection === 'reconnecting' ? 'reconnecting' : 'pending';
    else tone = state.snap.status;
    var s = STATUS[tone];
    els.status.setAttribute('data-tone', tone === 'reconnecting' ? 'pending' : tone);
    setTr(els.statusLabel, s[0], s[1]);
  }

  function render() {
    renderStatus();
    var snap = state.snap;
    if (!snap) return; // keep the server-rendered placeholder until the first read

    var m = snap.match;
    els.board.textContent = '';
    if (m) {
      if (snap.status === 'final') els.board.appendChild(finalSummary(m));
      els.board.appendChild(m.sport === 'basketball' ? basketBoard(m) : volleyBoard(m));
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

    els.updated.textContent = m && state.lastAt ? tr('liveUpdatedAt', 'Aktualisiert {time}', { time: formatTime(state.lastAt) }) : '';
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
    if (key !== state.key) {
      state.key = key;
      state.snap = snap;
      render();
    } else {
      renderStatus();
      if (snap.match) els.updated.textContent = tr('liveUpdatedAt', 'Aktualisiert {time}', { time: formatTime(state.lastAt) });
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
    var q = '/items/live_history?limit=' + HISTORY_LIMIT + '&sort=-finished_at'
      + '&fields=id,sport,team_a_short,team_a_name,team_b_short,team_b_name,points_a,points_b,sets_won_a,sets_won_b,set_results,finished_at'
      + '&filter[channel][_eq]=' + encodeURIComponent(channel);
    getJSON(q).then(function (rows) {
      els.recentBody.textContent = '';
      rows.forEach(function (r) {
        var bySets = normaliseSport(r.sport) !== 'basketball';
        var tr_ = document.createElement('tr');
        tr_.appendChild(h('td', 'live-recent-match',
          (r.team_a_short || r.team_a_name || '—') + ' – ' + (r.team_b_short || r.team_b_name || '—')));
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
