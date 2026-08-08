/**
 * KSCW Basketball Youth — expired training lines + live open / waiting-list status
 *
 * The /basketball/teams/nachwuchs page is statically built, so the green
 * "Offen für neue Spieler" badge + contact link and the gold "Team voll" /
 * waiting-list button are baked in at build time from Directus. This script
 * re-fetches that status live in the browser and reconciles each card against
 * the current Directus state — so flipping teams.open_for_players (or setting a
 * waitlist_url) shows up immediately, with no site rebuild.
 *
 * The build-time render stays as the no-JS / instant-paint fallback; this just
 * replaces the status rows with fresh ones. Cards are matched to a team by
 * data-team-name (the exact teams.name), because one age group can hold two
 * squads — DU18 Spark and DU18 Fire are both U18. data-team-code (HU18, DU18,
 * MU8 …) narrows it when the name no longer resolves, i.e. after a rename.
 */
(function () {
  'use strict';

  var cards = document.querySelectorAll('.youth-meta[data-team-code]');
  if (!cards.length) return;

  // Mirror of cardCode() in src/lib/fetch/youthBasketball.ts — the age group a
  // team belongs to, read off its own name. See the comment there for why the
  // league is the wrong source and why a name→card lookup table kept breaking.
  // tests/unit/youth-basketball.test.ts checks the two copies agree on the
  // live team names.
  var CODE_TOKEN = /([HDM])U\s*0*(\d+)/i;

  function cardCode(name) {
    var m = CODE_TOKEN.exec(String(name || ''));
    return m ? m[1].toUpperCase() + 'U' + Number(m[2]) : '';
  }

  // Mirror of cardTitle() — the live Directus name only replaces the page's
  // German label when it says more than the bare code ("DU18 Spark" yes,
  // "MU8" no). Returns '' to mean "keep the label".
  function cardTitle(name, code) {
    var n = String(name || '').trim();
    if (!n) return '';
    return n.replace(/\s+/g, '').toUpperCase() === String(code).toUpperCase() ? '' : n;
  }

  // Mirror of DEFAULT_WAITLIST_URL in src/lib/fetch/youthBasketball.ts — the
  // club-wide waiting list a closed team falls back to. See the comment there.
  var DEFAULT_WAITLIST_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLSfvak-SELFox7Bv2RVLrjA_uZ2K6vTiKYgRheDtck92VH8crQ/viewform';

  // ── Expired training lines ────────────────────────────────────────────
  // Training times are baked in at build time, and the site only rebuilds when
  // Directus *content changes* (the auto-rebuild Flow triggers on
  // items.create/update/delete for teams/hall_slots/members). A booking that
  // simply reaches the end of its validity window fires no such event, so the
  // build alone can never drop it — it would linger until an unrelated edit
  // happened to trigger a deploy. Each line carries its own end date, so prune
  // them here on every page load instead.
  //
  // Only removal is needed: the build keeps *upcoming* bookings, so a new
  // season's slots are already in the HTML before their first week, and any
  // genuinely new slot is a Directus edit that does trigger a rebuild.
  function pruneExpiredSlots() {
    var today = new Date().toISOString().slice(0, 10);
    for (var i = 0; i < cards.length; i++) {
      var meta = cards[i];
      var lines = meta.querySelectorAll('.youth-slot[data-valid-until]');
      for (var j = 0; j < lines.length; j++) {
        // ISO dates compare correctly as strings.
        if (lines[j].getAttribute('data-valid-until') < today) {
          lines[j].parentNode.removeChild(lines[j]);
        }
      }
      // Nothing left → drop the now-dangling "Training:" label as well.
      if (!meta.querySelector('.youth-slot')) {
        var label = meta.querySelector('.youth-meta-label');
        if (label) label.parentNode.removeChild(label);
      }
    }
  }

  pruneExpiredSlots();

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
  // A field the anonymous role can't read 403s the whole request, so on a
  // Directus that has not run migration 298 yet the combined query returns
  // nothing at all. Retry without the two gender fields so the open/full badges
  // survive; only the girls/boys split is lost. Mirrors fetchOpenTeams() in
  // src/lib/fetch/youthBasketball.ts.
  function fetchOpen() {
    var full = 'id,name,open_for_players,open_for_girls,open_for_boys';
    return fetchRows(full).then(function (rows) {
      return rows.length ? rows : fetchRows('id,name,open_for_players');
    });
  }

  // waitlist_url / waitlist_label are public-readable as of 2026-08-08 (they
  // were not before, and this request used to 403 into []). Still isolated from
  // the open fetch so that a future permission change only drops the "Team
  // voll" buttons rather than the open badges too.
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

  // Only allow http(s)/mailto (and root-relative) URLs into an href — a
  // javascript: URL coming from Directus would otherwise be an XSS sink.
  // Mirrors the href post-pass in news-modal.js. Returns '' for unsafe URLs.
  function safeUrl(url) {
    var u = String(url || '').trim();
    if (/^https?:/i.test(u) || /^mailto:/i.test(u) || u.charAt(0) === '/') return u;
    return '';
  }

  // Full team → gold "Team voll" badge + waiting-list link. A custom label from
  // Directus renders verbatim; an empty label uses the localisable key.
  // w.badge overrides the badge for the closed half of a split mixed card.
  function buildWaitlist(w) {
    var wrap = el('div', 'youth-waitlist');
    var badge = el('span', 'youth-full-badge');
    badge.setAttribute('data-i18n', w.badge ? w.badge[0] : 'bbTeamFull');
    badge.textContent = w.badge ? w.badge[1] : 'Team voll';
    var a = el('a', 'btn btn-outline btn-sm youth-waitlist-btn');
    // Validate the scheme before it reaches the href; an unsafe URL renders the
    // label as a plain (non-clickable) element rather than as a link.
    var href = safeUrl(w.url);
    if (href) {
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
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

  // True when a mixed card takes one gender but not the other — the case that
  // splits it into a green half and a gold half. Mirror of splitByGender in
  // components/YouthMeta.astro; see the comment there for why both-on and
  // both-off deliberately stay on the single generic row.
  function splitByGender(o, code) {
    return String(code || '').charAt(0).toUpperCase() === 'M' && o.girls !== o.boys;
  }

  // The green badge a recruiting team shows: the gender it is taking on a split
  // mixed card, otherwise the generic one (feminine for D-codes; English is
  // neutral, so bbTeamOpenF carries the same value as bbTeamOpen).
  function openBadge(o, code) {
    if (splitByGender(o, code)) {
      return o.girls
        ? ['bbTeamOpenGirls', 'Offen für neue Spielerinnen']
        : ['bbTeamOpenBoys', 'Offen für neue Spieler'];
    }
    return String(code || '').charAt(0).toUpperCase() === 'D'
      ? ['bbTeamOpenF', 'Offen für neue Spielerinnen']
      : ['bbTeamOpen', 'Offen für neue Spieler'];
  }

  // The gold badge for the half a split mixed card is NOT taking.
  function closedBadge(o, code) {
    if (!splitByGender(o, code)) return null;
    return o.girls
      ? ['bbTeamFullBoys', 'Knaben: Team voll']
      : ['bbTeamFullGirls', 'Mädchen: Team voll'];
  }

  // Not full + recruiting → green badge + contact link, prefilled to this team.
  function buildOpen(o, code) {
    var wrap = el('div', 'youth-open');
    var text = openBadge(o, code);
    var badge = el('span', 'youth-open-badge');
    badge.setAttribute('data-i18n', text[0]);
    badge.textContent = text[1];
    wrap.appendChild(badge);
    var a = el('a', 'btn btn-outline btn-sm youth-open-btn');
    a.href = '/club/kontakt?sport=basketball' + (o.id ? '&teamId=' + encodeURIComponent(o.id) : '');
    var label = el('span');
    label.setAttribute('data-i18n', 'bbTeamOpenCta');
    label.textContent = 'Kontakt aufnehmen';
    a.appendChild(label);
    a.appendChild(arrow());
    wrap.appendChild(a);
    return wrap;
  }

  // Card headings follow the live Directus name, so a team rename lands without
  // a rebuild — the same reason the badges are reconciled here. A team that goes
  // back to a bare-code name (or drops off the fetch entirely) gets its
  // data-i18n key put back, so the page's own German label returns and keeps
  // following the language toggle.
  function renderTitles(perCode, soleOf) {
    var titles = document.querySelectorAll('h3[data-team-title]');
    for (var i = 0; i < titles.length; i++) {
      var h = titles[i];
      var code = h.getAttribute('data-team-title') || '';
      if (!perCode[code]) continue;                 // no live team → leave as built
      var key = h.getAttribute('data-team-name') || soleOf(code);
      if (!key) continue;                           // several squads → ambiguous
      var live = cardTitle(key, code);
      if (live) {
        h.removeAttribute('data-i18n');
        h.textContent = live;
      } else {
        var fallback = h.getAttribute('data-i18n-fallback');
        if (fallback) h.setAttribute('data-i18n', fallback);
      }
    }
  }

  function render(openRows, waitRows) {
    // Only reconcile against live data when the fetch actually returned rows.
    // On a fetch error / empty result both arrays are [], so we leave the
    // server-rendered fallback badges in place rather than wiping every card's
    // status. (waitRows alone may legitimately be [] — that's the expected 403
    // while waitlist_url stays non-public — so the open fetch is what gates.)
    if (!openRows.length && !waitRows.length) return;

    // Status is keyed by the EXACT Directus team name, because an age group can
    // hold more than one squad (DU18 Spark and DU18 Fire both sit under DU18)
    // and a code alone would give them each other's badge.
    var open = {}, wait = {}, perCode = {};
    function remember(name) {
      var code = cardCode(name);
      if (!code) return '';
      (perCode[code] || (perCode[code] = [])).push(name);
      return code;
    }
    openRows.forEach(function (t) {
      if (!t || !t.name || !remember(t.name)) return;
      open[t.name] = {
        id: String(t.id),
        open: t.open_for_players === true,
        girls: t.open_for_girls === true,
        boys: t.open_for_boys === true
      };
    });
    waitRows.forEach(function (t) {
      if (!t || !t.name) return;
      var url = t.waitlist_url ? String(t.waitlist_url).trim() : '';
      if (!cardCode(t.name) || !url) return;
      wait[t.name] = { url: url, label: t.waitlist_label ? String(t.waitlist_label).trim() : '' };
    });

    // The one team in an age group, or '' when the group holds several. Used to
    // re-find a card whose build-time name no longer exists — i.e. exactly the
    // rename case this whole matching scheme exists to survive. With two squads
    // sharing a group a rename is genuinely ambiguous, so the card is left as
    // built (the Directus edit triggers a rebuild anyway).
    function soleOf(code) {
      var seen = perCode[code] || [];
      var uniq = seen.filter(function (n, i) { return seen.indexOf(n) === i; });
      return uniq.length === 1 ? uniq[0] : '';
    }

    renderTitles(perCode, soleOf);

    for (var i = 0; i < cards.length; i++) {
      var meta = cards[i];
      var code = (meta.getAttribute('data-team-code') || '').toUpperCase();
      var key = meta.getAttribute('data-team-name') || '';
      if (!open[key] && !wait[key]) key = soleOf(code) || key;

      var o = open[key];
      var w = wait[key];
      // Nothing live to say about this card — leave what the build rendered
      // rather than stripping it to an empty card.
      if (!o && !w) continue;

      // Drop the build-rendered status rows; rebuild from live data.
      var stale = meta.querySelectorAll('.youth-open, .youth-waitlist');
      for (var s = 0; s < stale.length; s++) stale[s].parentNode.removeChild(stale[s]);

      // Closed team with no link of its own → club-wide waiting list. Mirrors
      // the build's rule; requires o to exist, so an unknown status (failed
      // fetch) never flips a card to "full".
      if (!w && o && o.open === false) w = { url: DEFAULT_WAITLIST_URL, label: '' };
      // A waitlist link means "full" and wins over the open badge, matching the
      // build's `openForPlayers = !waitlistUrl && open` rule.
      if (w) {
        meta.appendChild(buildWaitlist(w));
      } else if (o && o.open) {
        meta.appendChild(buildOpen(o, code));
        // Split mixed card → the gender it is not taking gets the club-wide
        // waiting list underneath.
        var closed = closedBadge(o, code);
        if (closed) {
          meta.appendChild(buildWaitlist({ url: DEFAULT_WAITLIST_URL, label: '', badge: closed }));
        }
      }
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
