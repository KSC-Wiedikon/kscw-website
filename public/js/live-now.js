/**
 * KSCW "Live now" pill — a small fixed link to /live that appears on every page
 * while a match is published live: the hall scoreboard, or a game scored from a
 * phone in wiedisync (channel `game-<id>`). Port of wiedisync's LiveNowBanner
 * (src/modules/live/liveNow.ts — keep the two rules the same).
 *
 *  - Polls every 30 s, not 3 s: "is something live?" changes once or twice an
 *    evening. The 3 s cadence belongs to /live itself, where the score is the content.
 *  - Fixed-position and created only when live, so it never shifts the layout (CLS)
 *    and costs nothing on a normal day.
 *  - 'final' is not live: a finished match left on the board all evening would
 *    otherwise keep advertising itself. Nor is a row nobody wrote for 20 minutes
 *    (a board switched off mid-match).
 *  - A board that knows the fixture writes the match twice: its own row and the
 *    game's (`source: 'board:<channel>'`). The board's own row is then skipped.
 *  - The link opens that row's channel. Wording stays unattached to a fixture.
 */
(function () {
  'use strict';

  var path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/live' || path === '/admin') return;

  var DIRECTUS_URL = window.__KSCW_DIRECTUS || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch');
  var POLL_MS = 30000;
  var STALE_MS = 20 * 60 * 1000;
  var URL_ = DIRECTUS_URL + '/items/live_scores?limit=20&filter[status][_eq]=live&sort=-date_updated'
    + '&fields=channel,status,team_a_short,team_b_short,points_a,points_b,date_updated,source';

  function updatedMs(r) {
    var t = r.date_updated ? new Date(r.date_updated).getTime() : NaN;
    return isFinite(t) ? t : NaN;
  }

  /** The one live row to show, or null (same rules as wiedisync's pickLiveNow). */
  function pick(rows, now) {
    var live = (rows || []).filter(function (r) {
      if (!r || r.status !== 'live') return false;
      var t = updatedMs(r);
      return !isFinite(t) || now - t <= STALE_MS;
    });
    var mirrored = {};
    live.forEach(function (r) {
      var src = String(r.source || '');
      if (src.indexOf('board:') === 0) mirrored[src.slice(6)] = true;
    });
    var kept = live.filter(function (r) { return !mirrored[r.channel]; });
    kept.sort(function (x, y) { return (updatedMs(y) || 0) - (updatedMs(x) || 0); });
    return kept[0] || null;
  }

  function hrefFor(channel) {
    return !channel || channel === 'kscw' ? '/live' : '/live?channel=' + encodeURIComponent(channel);
  }

  var pill = null;

  function tr(key, fallback) {
    var v = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
    return v && v !== key ? v : fallback;
  }

  function span(cls, key, fallback) {
    var el = document.createElement('span');
    el.className = cls;
    if (key) { el.setAttribute('data-i18n', key); el.textContent = tr(key, fallback); }
    return el;
  }

  function show(row) {
    if (!pill) {
      pill = document.createElement('a');
      pill.href = '/live';
      pill.className = 'live-now-pill';
      var badge = span('live-now-badge');
      badge.appendChild(span('live-dot'));
      badge.appendChild(span('', 'liveStatusLive', 'Live'));
      pill.appendChild(badge);
      pill.appendChild(span('live-now-headline'));
      pill.appendChild(span('live-now-cta', 'liveWatch', 'Ansehen'));
      document.body.appendChild(pill);
    }
    pill.href = hrefFor(row.channel);
    var headline = ((row.team_a_short || '') + ' ' + (Number(row.points_a) || 0) + ' : '
      + (Number(row.points_b) || 0) + ' ' + (row.team_b_short || '')).trim();
    pill.querySelector('.live-now-headline').textContent = headline;
  }

  function hide() {
    if (pill) { pill.remove(); pill = null; }
  }

  function poll() {
    if (document.visibilityState === 'hidden') return;
    fetch(URL_, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var row = pick(j && j.data, Date.now());
        if (row) show(row); else hide();
      })
      // Best-effort: a network blip or missing permission just means no pill.
      .catch(hide);
  }

  // For the unit test (tests/unit/live-now.test.ts); harmless on the page.
  window.KSCWLiveNow = { pick: pick, hrefFor: hrefFor };

  poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') poll();
  });
})();
