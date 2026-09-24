/**
 * KSCW "Live now" pill — a small fixed link to /live that appears on every page
 * while the hall scoreboard is running a match. Port of wiedisync's LiveNowBanner.
 *
 *  - Polls every 30 s, not 3 s: "is something live?" changes once or twice an
 *    evening. The 3 s cadence belongs to /live itself, where the score is the content.
 *  - Fixed-position and created only when live, so it never shifts the layout (CLS)
 *    and costs nothing on a normal day.
 *  - 'final' is not live: a finished match left on the board all evening would
 *    otherwise keep advertising itself.
 *  - Wording stays unattached to a fixture — `live_scores` has no `games` link.
 */
(function () {
  'use strict';

  var path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/live' || path === '/admin') return;

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var POLL_MS = 30000;
  var URL_ = DIRECTUS_URL + '/items/live_scores?limit=1&filter[channel][_eq]=kscw'
    + '&fields=status,team_a_short,team_b_short,points_a,points_b';

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
        var row = j && j.data && j.data[0];
        if (row && row.status === 'live') show(row); else hide();
      })
      // Best-effort: a network blip or missing permission just means no pill.
      .catch(hide);
  }

  poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') poll();
  });
})();
