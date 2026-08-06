/**
 * Game Detail Modal — public website version of Wiedisync's GameDetailModal.
 * Shows: teams, score, sets, date/time, venue + Google Maps link.
 * No auth, no participation, no scorer duties.
 *
 * Usage: call showGameModal(game, locale) where game is a KSCW.games[] object.
 */
(function () {
  'use strict';

  var overlay = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function createChipSpan(game) {
    var chip = el('span', 'chip');
    if (game.teamColor) {
      chip.style.background = game.teamColor;
      chip.style.color = '#fff';
      chip.textContent = game.teamShort || game.teamName || '';
    } else {
      chip.style.background = '#e2e8f0';
      chip.style.color = '#475569';
      chip.textContent = game.teamShort || game.teamName || '';
    }
    return chip;
  }

  // ── Cup games ─────────────────────────────────────────────────────────
  // `games` carries no competition-type field; the only marker a cup fixture
  // has is its league string ("Züri Cup — 1/8-Final, Spiel 4", "Mobiliar
  // Volley Cup — Tour 2, Spiel 26"). Word-bounded so a league that merely
  // contains the letters (e.g. a club name) doesn't match.
  var CUP_RE = /\b(cup|pokal|coupe)\b/i;

  function isCupGame(game) {
    return !!game && CUP_RE.test(game.league || '');
  }

  // Lucide "trophy" (vendored 0.577.0). Built here rather than via
  // `<i data-lucide>`: game rows are created after lucide.createIcons() has
  // already run, so the placeholder would never be replaced.
  var TROPHY_PATHS = [
    'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
    'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
    'M18 9h1.5a1 1 0 0 0 0-5H18',
    'M4 22h16',
    'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
    'M6 9H4.5a1 1 0 0 1 0-5H6'
  ];

  /**
   * Trophy marker for cup fixtures.
   * @param {string|null} label competition name for the tooltip / screen
   *   readers; pass null where the surrounding text already names it.
   */
  function createCupIcon(label) {
    var ns = 'http://www.w3.org/2000/svg';
    var span = el('span', 'game-cup-icon');
    if (label) {
      span.title = label;
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', label);
    } else {
      span.setAttribute('aria-hidden', 'true');
    }
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < TROPHY_PATHS.length; i++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', TROPHY_PATHS[i]);
      svg.appendChild(p);
    }
    span.appendChild(svg);
    return span;
  }

  // Shared with the game tables (homepage + team pages), which are rendered
  // by their own scripts but load this one first.
  window.KSCWGameIcons = { isCupGame: isCupGame, createCupIcon: createCupIcon };

  function infoRow(label, value) {
    var row = el('div', 'gm-row');
    row.appendChild(el('span', 'gm-label', label));
    if (typeof value === 'string') {
      row.appendChild(el('span', 'gm-value', value));
    } else {
      var v = el('span', 'gm-value');
      v.appendChild(value);
      row.appendChild(v);
    }
    return row;
  }

  // Close button SVG built via DOM (no innerHTML needed)
  function createCloseSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'currentColor');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');
    path.setAttribute('d', 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z');
    svg.appendChild(path);
    return svg;
  }

  function close() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      document.body.style.overflow = '';
    }
  }

  window.showGameModal = function (game, locale) {
    if (overlay) close();

    // Default to the live document language when no locale is passed, so the
    // modal matches the active UI language even if a caller omits the param.
    if (!locale) locale = document.documentElement.lang || 'de';
    var isDE = locale !== 'en';

    document.body.style.overflow = 'hidden';
    overlay = el('div', 'game-modal-overlay');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    var modal = el('div', 'game-modal');
    overlay.appendChild(modal);

    // ── Header: league badge + team chip + close btn
    var header = el('div', 'gm-header');
    var left = el('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '0.5rem';
    if (game.league) {
      var leagueBadge = el('span', 'badge', game.league);
      if (isCupGame(game)) {
        leagueBadge.classList.add('badge-cup');
        // Decorative: the badge text already spells out the competition.
        leagueBadge.insertBefore(createCupIcon(null), leagueBadge.firstChild);
      }
      left.appendChild(leagueBadge);
    }
    left.appendChild(createChipSpan(game));
    header.appendChild(left);

    var closeBtn = el('button', 'gm-close');
    closeBtn.appendChild(createCloseSvg());
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // ── Score section
    var scoreSection = el('div', 'gm-score-section');
    var teamsRow = el('div', 'gm-teams-row');

    var homeEl = el('div', 'gm-team-name home-side', game.homeTeam);
    if (game.type === 'home') homeEl.classList.add('kscw');
    teamsRow.appendChild(homeEl);

    var center = el('div', 'gm-score-center');
    if (game.status === 'completed' && (game.score || (game.homeScore != null && game.awayScore != null))) {
      var homeS = game.homeScore || 0;
      var awayS = game.awayScore || 0;
      var isHome = game.type === 'home' || game.isHome;
      var isWin = isHome ? homeS > awayS : awayS > homeS;
      var isLoss = isHome ? homeS < awayS : awayS < homeS;
      var isBasketballTie = homeS === awayS && (game.sport === 'basketball' || game.teamSport === 'basketball');
      var homeSpan = el('span', '', String(homeS));
      var awaySpan = el('span', '', String(awayS));
      if (isBasketballTie) {
        homeSpan.style.color = 'var(--kscw-gold)';
        awaySpan.style.color = 'var(--kscw-gold)';
      } else {
        homeSpan.style.color = (game.type === 'home' || game.isHome)
          ? (isWin ? 'var(--success)' : isLoss ? 'var(--danger)' : 'var(--text)')
          : 'var(--text-muted)';
        awaySpan.style.color = (game.type === 'away' || !game.isHome)
          ? (isWin ? 'var(--success)' : isLoss ? 'var(--danger)' : 'var(--text)')
          : 'var(--text-muted)';
      }
      center.appendChild(homeSpan);
      center.appendChild(el('span', 'colon', ':'));
      center.appendChild(awaySpan);
    } else {
      center.appendChild(el('span', 'gm-vs', 'vs'));
    }
    teamsRow.appendChild(center);

    var awayEl = el('div', 'gm-team-name', game.awayTeam);
    if (game.type === 'away') awayEl.classList.add('kscw');
    teamsRow.appendChild(awayEl);
    scoreSection.appendChild(teamsRow);

    // Sets breakdown
    if (game.setsJson && game.setsJson.length > 0) {
      var table = el('table', 'gm-sets');
      var thead = el('thead');
      var hrow = el('tr');
      hrow.appendChild(el('th', '', ''));
      for (var si = 0; si < game.setsJson.length; si++) {
        hrow.appendChild(el('th', '', (isDE ? 'Satz ' : 'Set ') + (si + 1)));
      }
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = el('tbody');
      var homeRow = el('tr');
      homeRow.appendChild(el('td', '', isDE ? 'Heim' : 'Home'));
      var awayRow = el('tr');
      awayRow.appendChild(el('td', '', isDE ? 'Ausw.' : 'Away'));
      for (var sj = 0; sj < game.setsJson.length; sj++) {
        var s = game.setsJson[sj];
        var sh = s.home || 0;
        var sa = s.away || 0;
        var kscwWonSet = (sh > sa) === (game.type === 'home');
        homeRow.appendChild(el('td', kscwWonSet ? 'set-won' : 'set-lost', String(sh)));
        awayRow.appendChild(el('td', kscwWonSet ? 'set-won' : 'set-lost', String(sa)));
      }
      tbody.appendChild(homeRow);
      tbody.appendChild(awayRow);
      table.appendChild(tbody);
      scoreSection.appendChild(table);
    }

    modal.appendChild(scoreSection);

    // ── Game Info section
    var info = el('div', 'gm-section');
    info.appendChild(el('div', 'gm-section-title', isDE ? 'Spielinfo' : 'Game Info'));
    var dateLocale = isDE ? 'de-CH' : 'en-GB';
    var dateStr = game.date ? (game.date.length > 10 ? game.date.slice(0, 10) : game.date) : '';
    var dateLong = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '\u2013';
    info.appendChild(infoRow(isDE ? 'Datum' : 'Date', dateLong));
    info.appendChild(infoRow(isDE ? 'Anpfiff' : 'Kickoff', game.time ? game.time.slice(0, 5) : '\u2013'));
    var gameIsHome = game.type === 'home' || game.isHome;
    info.appendChild(infoRow(isDE ? 'Typ' : 'Type', gameIsHome ? (isDE ? 'Heimspiel' : 'Home') : (isDE ? 'Ausw\u00e4rtsspiel' : 'Away')));
    if (game.id) {
      info.appendChild(infoRow(isDE ? 'Spielnr.' : 'Game #', String(game.id).replace(/^(vb_|bb_)/, '')));
    }
    if (game.season) {
      info.appendChild(infoRow(isDE ? 'Saison' : 'Season', game.season));
    }
    modal.appendChild(info);

    // ── Officials section (referees, scorers, BB officials)
    var hasOfficials = (game.referees && game.referees.length) || game.scorerTeam || game.scorerName || game.bbOfficials;
    if (hasOfficials) {
      var officials = el('div', 'gm-section');
      officials.appendChild(el('div', 'gm-section-title', isDE ? 'Offizielle' : 'Officials'));

      // Referees — one row per referee labeled 1SR / 2SR (volleyball convention)
      if (game.referees && game.referees.length) {
        var srLabels = ['1SR', '2SR', '3SR'];
        for (var ri = 0; ri < game.referees.length; ri++) {
          var r = game.referees[ri];
          var refName = [r.first_name, r.last_name].filter(Boolean).join(' ');
          officials.appendChild(infoRow(srLabels[ri] || ('SR ' + (ri + 1)), refName));
        }
      }

      // Scorer — show named scorer when assigned, otherwise the duty team
      if (game.scorerName || game.scorerTeam) {
        var scorerLabel = isDE ? 'Schreiber' : 'Scorer';
        var scorerVal = game.scorerName
          ? (game.scorerTeam ? game.scorerName + ' (' + game.scorerTeam + ')' : game.scorerName)
          : game.scorerTeam;
        officials.appendChild(infoRow(scorerLabel, scorerVal));
      }

      // Basketball officials
      if (game.bbOfficials) {
        if (game.bbOfficials.scorer) {
          officials.appendChild(infoRow('Scorer', game.bbOfficials.scorer));
        }
        if (game.bbOfficials.timekeeper) {
          officials.appendChild(infoRow('Timekeeper', game.bbOfficials.timekeeper));
        }
        if (game.bbOfficials.shot_clock) {
          officials.appendChild(infoRow('24s Official', game.bbOfficials.shot_clock));
        }
      }

      modal.appendChild(officials);
    }

    // ── Venue section
    var hallData = game.hall;
    if (hallData && (hallData.name || hallData.address)) {
      var venue = el('div', 'gm-section');
      venue.appendChild(el('div', 'gm-section-title', isDE ? 'Spielort' : 'Venue'));
      if (hallData.name) {
        venue.appendChild(infoRow(isDE ? 'Halle' : 'Hall', hallData.name));
      }
      var addr = [hallData.address, hallData.city].filter(Boolean).join(', ');
      if (addr) {
        venue.appendChild(infoRow(isDE ? 'Adresse' : 'Address', addr));
      }
      var mapsUrl = hallData.mapsUrl || hallData.maps_url;
      if (mapsUrl) {
        var mapsLink = el('a', 'gm-link', 'Google Maps \u2197');
        mapsLink.href = mapsUrl;
        mapsLink.target = '_blank';
        mapsLink.rel = 'noopener noreferrer';
        venue.appendChild(infoRow(isDE ? 'Karte' : 'Map', mapsLink));
      }
      modal.appendChild(venue);
    }

    document.body.appendChild(overlay);

    // Escape key
    function onKey(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    }
    document.addEventListener('keydown', onKey);
  };
})();
