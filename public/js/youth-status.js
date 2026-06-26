/**
 * KSCW Basketball Youth — live open / waiting-list status
 *
 * The /basketball/teams/nachwuchs page is statically built, so the green
 * "Offen für neue Spieler" badge + contact link and the gold "Team voll" /
 * waiting-list button are baked in at build time from Directus. This script
 * re-fetches that status live in the browser and reconciles each card against
 * the current Directus state — so flipping teams.open_for_players (or setting a
 * waitlist_url) shows up immediately, with no site rebuild.
 *
 * The build-time render stays as the no-JS / instant-paint fallback; this just
 * replaces the status rows with fresh ones. Cards are matched by
 * data-team-code (HU18, DU16, MU8 …) === teams.name (upper-cased).
 */
(function () {
  'use strict';

  var cards = document.querySelectorAll('.youth-meta[data-team-code]');
  if (!cards.length) return;

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';

  var FILTER = encodeURIComponent(JSON.stringify({ sport: { _eq: 'basketball' }, active: { _eq: true } }));
  var BASE = DIRECTUS_URL + '/items/teams?limit=-1&filter=' + FILTER + '&fields=';

  function fetchRows(fields) {
    return fetch(BASE + encodeURIComponent(fields))
      .then(function (r) { return r.ok ? r.json() : { data: [] }; })
      .then(function (j) { return j.data || []; })
      .catch(function () { return []; });
  }

  // open_for_players + id are public-readable, so the open badges are reliable.
  function fetchOpen() { return fetchRows('id,name,open_for_players'); }

  // waitlist_url / waitlist_label are NOT public today → this request 403s and
  // resolves to [] (no "Team voll" buttons). Isolated from the open fetch so
  // that failure never drops the open badges. The moment the Public role is
  // granted read on these two fields, the buttons light up — no code change.
  function fetchWaitlist() { return fetchRows('name,waitlist_url,waitlist_label'); }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function arrow() {
    var a = el('span');
    a.setAttribute('aria-hidden', 'true');
    a.textContent = '→';
    return a;
  }

  // Full team → gold "Team voll" badge + waiting-list link. A custom label from
  // Directus renders verbatim; an empty label uses the localisable key.
  function buildWaitlist(w) {
    var wrap = el('div', 'youth-waitlist');
    var badge = el('span', 'youth-full-badge');
    badge.setAttribute('data-i18n', 'bbTeamFull');
    badge.textContent = 'Team voll';
    var a = el('a', 'btn btn-outline btn-sm youth-waitlist-btn');
    a.href = w.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    var label = el('span');
    if (w.label) {
      label.textContent = w.label;
    } else {
      label.setAttribute('data-i18n', 'bbWaitlistLabel');
      label.textContent = 'Warteliste';
    }
    a.appendChild(label);
    a.appendChild(arrow());
    wrap.appendChild(badge);
    wrap.appendChild(a);
    return wrap;
  }

  // Not full + recruiting → green badge + contact link, prefilled to this team.
  // Female youth teams (D-codes) get the feminine German badge "…Spielerinnen";
  // male (H) / mixed (M) keep "…Spieler". English is neutral (same key value).
  function buildOpen(o, code) {
    var female = String(code || '').charAt(0).toUpperCase() === 'D';
    var wrap = el('div', 'youth-open');
    var badge = el('span', 'youth-open-badge');
    badge.setAttribute('data-i18n', female ? 'bbTeamOpenF' : 'bbTeamOpen');
    badge.textContent = female ? 'Offen für neue Spielerinnen' : 'Offen für neue Spieler';
    var a = el('a', 'btn btn-outline btn-sm youth-open-btn');
    a.href = '/club/kontakt?sport=basketball' + (o.id ? '&teamId=' + encodeURIComponent(o.id) : '');
    var label = el('span');
    label.setAttribute('data-i18n', 'bbTeamOpenCta');
    label.textContent = 'Kontakt aufnehmen';
    a.appendChild(label);
    a.appendChild(arrow());
    wrap.appendChild(badge);
    wrap.appendChild(a);
    return wrap;
  }

  function render(openRows, waitRows) {
    var open = {}, wait = {};
    openRows.forEach(function (t) {
      if (t && t.name) open[String(t.name).toUpperCase()] = { id: String(t.id), open: t.open_for_players === true };
    });
    waitRows.forEach(function (t) {
      var url = t && t.waitlist_url ? String(t.waitlist_url).trim() : '';
      if (url && t.name) wait[String(t.name).toUpperCase()] = { url: url, label: t.waitlist_label ? String(t.waitlist_label).trim() : '' };
    });

    for (var i = 0; i < cards.length; i++) {
      var meta = cards[i];
      var code = (meta.getAttribute('data-team-code') || '').toUpperCase();

      // Drop the build-rendered status rows; rebuild from live data.
      var stale = meta.querySelectorAll('.youth-open, .youth-waitlist');
      for (var s = 0; s < stale.length; s++) stale[s].parentNode.removeChild(stale[s]);

      var w = wait[code];
      var o = open[code];
      // A non-empty waitlist_url means "full" and wins over the open badge,
      // matching the build's `openForPlayers = !waitlistUrl && open` rule.
      if (w) meta.appendChild(buildWaitlist(w));
      else if (o && o.open) meta.appendChild(buildOpen(o, code));
    }

    // Localise the freshly injected data-i18n nodes to the active language.
    // (The site-wide langChanged handler re-applies on later toggles.)
    if (window.i18n && window.i18n.applyTranslations) window.i18n.applyTranslations();
  }

  function run() {
    Promise.all([fetchOpen(), fetchWaitlist()]).then(function (res) { render(res[0], res[1]); });
  }

  // Wait for i18n so applyTranslations has strings to localise into.
  if (window.i18nReady && window.i18nReady.then) window.i18nReady.then(run);
  else run();
})();
