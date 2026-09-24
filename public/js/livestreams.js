/**
 * KSCW livestreams — upcoming games a coach gave a website video link in wiedisync.
 *
 * A "Show on website" link on a game that has not been played yet IS its livestream
 * (wiedisync GET /kscw/public/livestreams). Once the game is completed the same link
 * drops off this list and shows as the recording icon on the result row instead.
 *
 *  - Homepage: fills `#livestreams` and un-hides its section (stays hidden with no
 *    streams, so a normal week costs nothing and shifts nothing).
 *  - Game tables: game-modal.js highlights upcoming rows that carry a link.
 */
(function () {
  'use strict';

  var root = document.getElementById('livestreams');
  if (!root) return;
  var section = root.closest('section');

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var MAX_SHOWN = 6;

  function tr(key, fallback) {
    var v = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
    return v && v !== key ? v : fallback;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function i18nEl(tag, cls, key, fallback) {
    var n = el(tag, cls, tr(key, fallback));
    n.setAttribute('data-i18n', key);
    return n;
  }

  function todayZurich() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  }

  function formatDate(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Shared guard (safe-href.js), narrowed to https — the server only stores https.
  function safeUrl(u) {
    var h = window.kscwSafeHref ? window.kscwSafeHref(u) : '';
    return h && /^https:\/\//i.test(h) ? h : null;
  }

  function card(s) {
    var links = (s.links || []).filter(function (l) { return l && safeUrl(l.url); });
    if (!links.length) return null;
    var isToday = s.date === todayZurich();

    var c = el('article', 'stream-card' + (isToday ? ' stream-card--today' : ''));

    var head = el('div', 'stream-card-head');
    var badge = el('span', 'stream-badge');
    badge.appendChild(el('span', 'live-dot'));
    badge.appendChild(isToday
      ? i18nEl('span', '', 'livestreamToday', 'Heute live')
      : i18nEl('span', '', 'livestreamBadge', 'Livestream'));
    head.appendChild(badge);
    head.appendChild(el('span', 'stream-when', formatDate(s.date) + (s.time ? ' · ' + s.time : '')));
    c.appendChild(head);

    var match = el('div', 'stream-match');
    match.appendChild(el('span', 'stream-team' + (s.type === 'home' ? ' is-kscw' : ''), s.home_team || ''));
    match.appendChild(el('span', 'stream-vs', 'vs'));
    match.appendChild(el('span', 'stream-team' + (s.type === 'away' ? ' is-kscw' : ''), s.away_team || ''));
    c.appendChild(match);

    var meta = [s.league, s.hall].filter(Boolean).join(' · ');
    if (meta) c.appendChild(el('div', 'stream-meta', meta));

    var actions = el('div', 'stream-actions');
    links.forEach(function (l, i) {
      var a = el('a', i === 0 ? 'btn btn-sm stream-watch' : 'btn btn-sm btn-outline');
      a.href = safeUrl(l.url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (l.title) a.textContent = l.title + ' ↗';
      else {
        a.setAttribute('data-i18n', 'livestreamWatch');
        a.textContent = tr('livestreamWatch', 'Zum Livestream');
      }
      actions.appendChild(a);
    });
    c.appendChild(actions);
    return c;
  }

  fetch(DIRECTUS_URL + '/kscw/public/livestreams')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (res) {
      var list = (res && Array.isArray(res.data) ? res.data : []).slice(0, MAX_SHOWN);
      var frag = document.createDocumentFragment();
      list.forEach(function (s) { var c = card(s); if (c) frag.appendChild(c); });
      if (!frag.childNodes.length) return;
      root.appendChild(frag);
      if (section) section.hidden = false;
    })
    // Best-effort: no streams section on a network blip — the rest of the page is unaffected.
    .catch(function () {});
})();
