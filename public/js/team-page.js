/**
 * KSCW Team Page — Dynamic Data Loader
 *
 * Fetches roster, trainings, coach/captain from the Directus custom endpoint
 * and populates the team page sections.
 *
 * Usage: set window.TEAM_CONFIG = { short: 'H1', directusId: '1' }
 */
(function () {
  'use strict';

  var CFG = window.TEAM_CONFIG;
  if (!CFG || (!CFG.short && !CFG.directusId)) return;

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TEAM = CFG.short || '';
  var TEAM_DIRECTUS_ID = CFG.directusId;
  var IS_WOMEN = false; // set after team data loads

  function getPosLabel(key) {
    var map = {
      setter: 'posSetter', opposite: 'posOpposite',
      outside_hitter: 'posOutsideHitter', outside: 'posOutsideHitter',
      middle_blocker: 'posMiddleBlocker', middle: 'posMiddleBlocker',
      libero: 'posLibero',
      point_guard: 'posPointGuard', shooting_guard: 'posShootingGuard',
      small_forward: 'posSmallForward', power_forward: 'posPowerForward', center: 'posCenter'
    };
    // Feminine forms for women's teams
    var femMap = { setter: 'posSetterF' };
    var i18nKey = (IS_WOMEN && femMap[key]) ? femMap[key] : (map[key] || 'posPlayer');
    return i18n.t(i18nKey);
  }

  function positionText(positions) {
    if (!positions || !positions.length) return '';
    var filtered = positions.filter(function (p) { return p !== 'other'; });
    if (!filtered.length) return '';
    return filtered.map(function (p) { return getPosLabel(p); }).join(', ');
  }

  function esc(s) { var d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

  function hideSection(tabId) {
    var btn = document.querySelector('[data-tab="' + tabId + '"]');
    if (btn) btn.style.display = 'none';
    var panel = document.querySelector('[data-tab-panel="' + tabId + '"]');
    if (panel) panel.style.display = 'none';
  }

  // ── Render hero section dynamically ──────────────────────────────
  function renderHero(teamData) {
    var container = document.getElementById('team-hero-container');
    if (!container) return;

    // Always use KSCW brand blue for team hero
    var color = 'var(--kscw-blue)';

    var section = document.createElement('section');
    section.className = 'team-hero';
    section.style.setProperty('--team-color', color);

    var inner = document.createElement('div');
    inner.className = 'container';

    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = color;
    chip.style.color = '#fff';
    chip.style.marginBottom = '0.75rem';
    chip.style.display = 'inline-block';
    chip.textContent = TEAM;
    inner.appendChild(chip);

    var h1 = document.createElement('h1');
    h1.textContent = teamData.full_name || teamData.name || TEAM;
    inner.appendChild(h1);

    var league = document.createElement('p');
    league.className = 'team-league';
    league.textContent = (teamData.league || '') + (teamData.season ? ' — ' + i18n.t('teamSeason') + ' ' + teamData.season : '');
    inner.appendChild(league);

    section.appendChild(inner);
    container.appendChild(section);
  }

  // ── Render team photo ──────────────────────────────────────────────
  function renderTeamPhoto(teamData) {
    if (document.querySelector('.team-photo')) return;
    if (!teamData.team_picture) return;

    var url = DIRECTUS_URL + '/assets/' + teamData.team_picture + '?width=1280&quality=80';

    function createPhotoEl() {
      var wrapper = document.createElement('div');
      wrapper.className = 'team-photo-wrapper';
      var img = document.createElement('img');
      img.src = url;
      img.alt = i18n.t('teamPhoto') + ' ' + esc(teamData.name || TEAM);
      img.className = 'team-photo';
      img.loading = 'lazy';
      wrapper.appendChild(img);
      return wrapper;
    }

    var container = document.getElementById('team-photo-container');
    if (!container) {
      // Fallback: insert after hero
      container = document.querySelector('.team-hero');
      if (!container) return;
      container.parentNode.insertBefore(createPhotoEl(), container.nextSibling);
      return;
    }
    container.appendChild(createPhotoEl());
  }

  // ── Render CTA section ─────────────────────────────────────────────
  function renderCTA(teamData, raw) {
    var container = document.getElementById('cta-container');
    if (!container) return;

    // Only show CTA if team is open for new players
    if (!raw.open_for_players) return;

    var sport = raw.sport || '';
    if (sport !== 'volleyball' && sport !== 'basketball') return;

    // Route to the central contact form, prefilled with sport + team.
    // The Directus /kscw/contact endpoint resolves the team's coaches + TR
    // server-side, so no email addresses are ever exposed in the browser.
    var locale = window.location.pathname.indexOf('/en/') === 0 ? 'en' : 'de';
    var contactPath = '/' + locale + '/club/kontakt';
    var qs = '?sport=' + encodeURIComponent(sport)
      + (TEAM_DIRECTUS_ID ? '&teamId=' + encodeURIComponent(TEAM_DIRECTUS_ID) : '');
    var contactHref = contactPath + qs;

    var section = document.createElement('section');
    section.className = 'cta-section';

    var inner = document.createElement('div');
    inner.className = 'container';

    // Title + recruiting badge share a flex header: the badge sits next to the
    // title on desktop and wraps to right below it on mobile (cta-header CSS).
    var header = document.createElement('div');
    header.className = 'cta-header';

    var h2 = document.createElement('h2');
    h2.textContent = i18n.t('teamCTA', { team: teamData.name || TEAM });
    header.appendChild(h2);

    // Team-level recruiting positions — the positions the team is looking for.
    var recruitText = positionText(Array.isArray(raw.recruiting_positions) ? raw.recruiting_positions : []);
    if (recruitText) {
      var recruitBadge = document.createElement('span');
      recruitBadge.className = 'cta-recruiting-positions';
      var recruitLabel = document.createElement('strong');
      recruitLabel.textContent = i18n.t('teamTrialLookingFor') + ': ';
      recruitBadge.appendChild(recruitLabel);
      recruitBadge.appendChild(document.createTextNode(recruitText));
      header.appendChild(recruitBadge);
    }
    inner.appendChild(header);

    var p = document.createElement('p');
    p.textContent = i18n.t('teamCTAText');
    inner.appendChild(p);

    // Upcoming trial trainings (Probetrainings) — only show when populated.
    // Dates render dd.mm.yyyy per Swiss convention regardless of UI locale.
    var trials = Array.isArray(raw.trial_trainings) ? raw.trial_trainings : [];
    if (trials.length) {
      var trialBox = document.createElement('div');
      trialBox.className = 'cta-trial-trainings';
      var trialHeading = document.createElement('h3');
      trialHeading.className = 'cta-trial-heading';
      trialHeading.textContent = i18n.t('teamTrialHeading');
      trialBox.appendChild(trialHeading);
      var trialList = document.createElement('ul');
      trialList.className = 'cta-trial-list';
      trials.forEach(function (t) {
        var li = document.createElement('li');
        var dateStr = '';
        if (t.date) {
          var d = new Date(String(t.date).slice(0, 10) + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            var dd = String(d.getDate()).padStart(2, '0');
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            dateStr = dd + '.' + mm + '.' + d.getFullYear();
          }
        }
        var startTime = String(t.start_time || '').slice(0, 5);
        var endTime = String(t.end_time || '').slice(0, 5);
        var timeRange = startTime + (endTime ? '–' + endTime : '');
        var hall = t.hall_name || '';
        var pieces = [];
        if (dateStr) pieces.push(dateStr);
        if (timeRange.length > 1) pieces.push(timeRange);
        if (hall) pieces.push(i18n.t('teamTrialAt') + ' ' + hall);
        li.textContent = pieces.join(' · ');
        if (t.notes) {
          var notesSpan = document.createElement('span');
          notesSpan.className = 'cta-trial-notes';
          notesSpan.textContent = ' — ' + t.notes;
          li.appendChild(notesSpan);
        }
        trialList.appendChild(li);
      });
      trialBox.appendChild(trialList);
      inner.appendChild(trialBox);
    }

    var btn = document.createElement('a');
    btn.href = contactHref;
    btn.className = 'btn btn-gold';
    btn.textContent = i18n.t('teamCTAButton');
    inner.appendChild(btn);

    section.appendChild(inner);
    container.appendChild(section);
  }

  // ── Render Instagram Feed ───────────────────────────────────────────
  // Uses Instagram's native /embed/ iframe URL for profile feeds.
  function renderInstagramEmbed(teamData) {
    var container = document.getElementById('instagram-embed-container');
    var embedEl = document.getElementById('instagram-embed');
    if (!container || !embedEl) return;

    var url = teamData.social_url || '';
    if (!url || url.indexOf('instagram.com/') === -1) return;

    var match = url.match(/instagram\.com\/([^/?]+)/);
    if (!match) return;
    var handle = match[1];

    container.style.display = '';

    var heading = document.getElementById('instagram-heading');
    if (heading) heading.textContent = '@' + handle;

    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.instagram.com/' + handle + '/embed/';
    iframe.className = 'ig-feed-iframe';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');

    embedEl.textContent = '';
    embedEl.appendChild(iframe);
  }

  // ── Fetch team data from public API ───────────────────────────────
  function fetchTeamData() {
    if (!TEAM_DIRECTUS_ID) { hideSection('kader'); hideSection('training'); return; }

    fetch(DIRECTUS_URL + '/kscw/public/team/' + TEAM_DIRECTUS_ID)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (resp) {
        // Directus wraps response in { data: { ...team fields, roster, coaches, ... } }
        var raw = resp.data || resp;
        var teamData = {
          id: raw.id,
          name: raw.name,
          full_name: raw.full_name,
          team_id: raw.team_id,
          sport: raw.sport,
          league: raw.league,
          season: raw.season,
          color: raw.color,
          active: raw.active,
          team_picture: raw.team_picture,
          team_picture_pos: raw.team_picture_pos,
          social_url: raw.social_url
        };

        // Detect women's team for gendered translations
        var name = (teamData.name || '').toLowerCase();
        var league = (teamData.league || '').toLowerCase();
        IS_WOMEN = /^d\d|^du\d|damen|frauen/.test(name) || /damen|frauen/.test(league);

        // Chip + short name ALWAYS follow the live team name so they can never
        // drift from the title/league — e.g. after a D1/D2 league swap the route
        // may carry a stale short, but the live name is authoritative.
        if (teamData.name) {
          TEAM = teamData.name;
          CFG.short = TEAM;
        }

        // Update page title
        document.title = (teamData.full_name || teamData.name || 'Team') + ' — KSC Wiedikon';

        // Render hero, photo, Instagram, CTA
        renderHero(teamData);
        renderTeamPhoto(teamData);
        renderInstagramEmbed(teamData);
        renderCTA(teamData, raw);

        // Map Directus field names to expected names
        var roster = raw.roster || [];
        var coaches = raw.coaches || [];
        // API exposes `captain` as a single member ID; normalize to an ID array
        // (also support a legacy `captains` array in case it's ever added).
        var captainIds = Array.isArray(raw.captains)
          ? raw.captains.map(function (c) { return typeof c === 'object' ? c.id : c; })
          : (raw.captain != null ? [raw.captain] : []);
        var trainings = raw.upcoming_trainings || raw.trainings || [];
        var rawUpcoming = raw.upcoming_games || raw.upcoming || [];
        var rawResults = raw.results || [];
        var rankings = raw.rankings || [];
        var barrageRankings = raw.barrage_rankings || [];
        var sponsors = raw.sponsors || [];

        // Map raw game objects to the format buildGameRow expects
        function mapGame(g) {
          var score = (g.home_score != null && g.away_score != null)
            ? g.home_score + ':' + g.away_score : (g.score || null);
          var isHome = g.isHome != null ? g.isHome : g.type === 'home';
          return {
            game_id: g.game_id || g.id,
            date: g.date,
            time: g.time || '',
            home_team: g.home_team,
            away_team: g.away_team,
            score: score,
            isHome: isHome,
            league: g.league || teamData.league || '',
            season: g.season || teamData.season || '',
            hall: g.hall || null,
            sets_json: g.sets_json || null,
            sport: g.sport || teamData.sport || 'volleyball',
            status: g.status || (score ? 'completed' : 'scheduled'),
            referees: g.referees || null,
            scorer_team: g.scorer_team || null,
            bb_officials: g.bb_officials || null
          };
        }
        var upcoming = rawUpcoming.map(mapGame);
        var results = rawResults.map(mapGame);

        // Add sport field to rankings for frontend rendering
        for (var ri = 0; ri < rankings.length; ri++) {
          if (!rankings[ri].sport) rankings[ri].sport = teamData.sport || 'volleyball';
        }
        for (var bi = 0; bi < barrageRankings.length; bi++) {
          if (!barrageRankings[bi].sport) barrageRankings[bi].sport = teamData.sport || 'volleyball';
        }

        // Render tab content
        renderRoster(roster, coaches, captainIds, raw.show_guests_on_website !== false);
        initRosterViewToggle();
        renderTrainings(trainings);
        renderHookGames(upcoming, results, teamData);
        renderHookRankings(rankings, teamData, barrageRankings);
        renderSponsors(sponsors);

        // Update static tab labels and headings with i18n
        updateStaticLabels();
      })
      .catch(function () { hideSection('kader'); hideSection('training'); });
  }

  // ── Update static HTML labels with i18n ───────────────────────────
  function updateStaticLabels() {
    // Tab labels
    var tabMap = {
      kader: 'teamTabRoster',
      spiele: 'teamTabGames',
      rangliste: 'teamTabRankings',
      training: 'teamTabTraining',
      sponsoren: 'teamTabSponsors'
    };
    var keys = Object.keys(tabMap);
    for (var i = 0; i < keys.length; i++) {
      var btn = document.querySelector('[data-tab="' + keys[i] + '"]');
      if (btn) btn.textContent = i18n.t(tabMap[keys[i]]);
    }

    // Section headings in the spiele tab
    var upcomingH2 = document.querySelector('#upcoming-section h2');
    if (upcomingH2) upcomingH2.textContent = i18n.t('teamUpcoming');
    var resultsH2 = document.querySelector('#results-section h2');
    if (resultsH2) resultsH2.textContent = i18n.t('teamResults');
  }

  // ── Roster View Toggle ───────────────────────────────────────────
  function getRosterView() {
    try { return localStorage.getItem('kscw-roster-view') === 'list' ? 'list' : 'grid'; }
    catch (e) { return 'grid'; }
  }

  function initRosterViewToggle() {
    var toggle = document.getElementById('roster-view-toggle');
    if (!toggle) return;
    var gridBtn = toggle.querySelector('[data-view="grid"]');
    var listBtn = toggle.querySelector('[data-view="list"]');
    if (!gridBtn || !listBtn) return;

    function setActive(view) {
      if (view === 'list') { listBtn.classList.add('active'); gridBtn.classList.remove('active'); }
      else { gridBtn.classList.add('active'); listBtn.classList.remove('active'); }
    }
    setActive(getRosterView());

    function setView(view) {
      try { localStorage.setItem('kscw-roster-view', view); } catch (e) {}
      setActive(view);
      renderRosterView();
    }
    gridBtn.addEventListener('click', function () { setView('grid'); });
    listBtn.addEventListener('click', function () { setView('list'); });
  }

  // ── Render Sponsors ─────────────────────────────────────────────
  function renderSponsors(sponsors) {
    var el = document.getElementById('team-sponsors-grid');
    if (!el) return;
    if (!sponsors.length) { hideSection('sponsoren'); return; }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < sponsors.length; i++) {
      var sp = sponsors[i];
      var card = document.createElement('div');
      card.className = 'sponsor-page-card';

      var wrapper = card;
      if (sp.website_url) {
        var link = document.createElement('a');
        link.href = sp.website_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'sponsor-page-card';
        wrapper = link;
        card = link;
      }

      var logoRef = sp.logo_url || sp.logo;
      if (logoRef) {
        var img = document.createElement('img');
        img.src = logoRef.indexOf('http') === 0 ? logoRef : DIRECTUS_URL + '/assets/' + logoRef + '?width=200&quality=80';
        img.alt = sp.name;
        img.className = 'sponsor-logo';
        img.loading = 'lazy';
        wrapper.appendChild(img);
      }

      if (sp.name) {
        var nameEl = document.createElement('div');
        nameEl.className = 'sponsor-name';
        nameEl.textContent = sp.name;
        wrapper.appendChild(nameEl);
      }

      frag.appendChild(card);
    }

    el.textContent = '';
    el.appendChild(frag);
  }

  // ── Render Roster ─────────────────────────────────────────────────
  // Module-scoped state so the view toggle can re-render without re-fetching.
  var ROSTER_STATE = null;

  function renderRoster(roster, coach, captainIds, showGuests) {
    if (!roster.length) { hideSection('kader'); return; }

    roster.sort(function (a, b) {
      var ag = a.guest_level || 0, bg = b.guest_level || 0;
      if (ag !== bg) return ag - bg;
      return (a.last_name || '').localeCompare(b.last_name || '');
    });
    coach.sort(function (a, b) { return (a.last_name || '').localeCompare(b.last_name || ''); });

    var captainIdSet = {};
    for (var ci = 0; ci < (captainIds || []).length; ci++) {
      captainIdSet[captainIds[ci]] = true;
    }

    ROSTER_STATE = { roster: roster, coach: coach, showGuests: showGuests, captainIds: captainIdSet };
    renderRosterView();
  }

  function renderRosterView() {
    if (!ROSTER_STATE) return;
    var view = getRosterView();
    var el = document.getElementById('roster-grid');
    var metaEl = document.getElementById('roster-meta');
    if (!el) return;

    var data = ROSTER_STATE;
    var mainPlayers = [];
    var guests = [];
    for (var i = 0; i < data.roster.length; i++) {
      var m = data.roster[i];
      if (m.guest_level > 0) {
        if (data.showGuests) guests.push(m);
      } else {
        mainPlayers.push(m);
      }
    }

    el.textContent = '';
    if (view === 'list') {
      el.classList.remove('roster-grid');
      el.classList.add('roster-list-wrap');
      var sortedMain = mainPlayers.slice().sort(byNumberAsc);
      el.appendChild(buildRosterTable(sortedMain, data.captainIds, { showNumber: true }));
    } else {
      el.classList.remove('roster-list-wrap');
      el.classList.add('roster-grid');
      for (var ip = 0; ip < mainPlayers.length; ip++) {
        var mp = mainPlayers[ip];
        var isCap = data.captainIds[mp.id] === true;
        el.appendChild(buildPersonCard(mp, { isCaptain: isCap }));
      }
    }

    if (!metaEl) return;
    metaEl.textContent = '';

    // Coaches — table in list view (name + YOB), cards in grid view
    if (data.coach.length) {
      var label = document.createElement('p');
      label.style.fontWeight = '600';
      label.style.fontSize = 'var(--text-sm)';
      label.style.color = 'var(--text-secondary)';
      label.textContent = i18n.t('teamCoach') + ':';
      metaEl.appendChild(label);

      if (view === 'list') {
        var cTable = buildRosterTable(data.coach, {}, { showNumber: false, showPosition: false, isCoach: true });
        cTable.id = 'coach-grid';
        cTable.style.marginTop = 'var(--space-sm)';
        metaEl.appendChild(cTable);
      } else {
        var coachGrid = document.createElement('div');
        coachGrid.className = 'roster-grid';
        coachGrid.id = 'coach-grid';
        coachGrid.style.marginTop = 'var(--space-sm)';
        for (var ic = 0; ic < data.coach.length; ic++) {
          coachGrid.appendChild(buildPersonCard(data.coach[ic], { isCoach: true }));
        }
        metaEl.appendChild(coachGrid);
      }
    }

    // Guests — table in list view (no number column), cards in grid view
    if (guests.length) {
      var gLabel = document.createElement('p');
      gLabel.style.fontWeight = '600';
      gLabel.style.fontSize = 'var(--text-sm)';
      gLabel.style.color = 'var(--text-secondary)';
      gLabel.style.marginTop = 'var(--space-lg)';
      gLabel.textContent = i18n.t(guests.length === 1 ? 'teamGuest' : 'teamGuests') + ':';
      metaEl.appendChild(gLabel);

      if (view === 'list') {
        var gTable = buildRosterTable(guests, data.captainIds, { showNumber: false });
        gTable.id = 'guest-grid';
        gTable.style.marginTop = 'var(--space-sm)';
        metaEl.appendChild(gTable);
      } else {
        var guestGrid = document.createElement('div');
        guestGrid.className = 'roster-grid';
        guestGrid.id = 'guest-grid';
        guestGrid.style.marginTop = 'var(--space-sm)';
        for (var ig = 0; ig < guests.length; ig++) {
          guestGrid.appendChild(buildPersonCard(guests[ig], {}));
        }
        metaEl.appendChild(guestGrid);
      }
    }
  }

  function byNumberAsc(a, b) {
    var an = a.number == null ? Infinity : Number(a.number);
    var bn = b.number == null ? Infinity : Number(b.number);
    if (an !== bn) return an - bn;
    return (a.last_name || '').localeCompare(b.last_name || '');
  }

  function isLibero(m) {
    if (!m || !m.position) return false;
    for (var i = 0; i < m.position.length; i++) {
      if (m.position[i] === 'libero') return true;
    }
    return false;
  }

  function buildAvatar(m) {
    var photoId = m.photo_url || m.photo;
    var img = document.createElement('img');
    img.className = 'roster-avatar';
    img.alt = '';
    img.loading = 'lazy';
    if (photoId && m.website_visible !== false) {
      img.src = photoId.indexOf('http') === 0
        ? photoId
        : DIRECTUS_URL + '/assets/' + photoId + '?width=200&quality=80';
      img.style.objectFit = 'cover';
    } else {
      img.src = '/images/kscw_weiss.png';
    }
    return img;
  }

  function buildPersonCard(m, opts) {
    opts = opts || {};
    var libero = !opts.isCoach && isLibero(m);
    var classes = 'roster-card';
    if (opts.isCaptain) classes += ' captain-card';
    var card = document.createElement('div');
    card.className = classes;
    card.appendChild(buildAvatar(m));

    var info = document.createElement('div');
    var nameEl = document.createElement('div');
    nameEl.className = 'roster-name';
    nameEl.textContent = m.first_name + ' ' + m.last_name;
    info.appendChild(nameEl);

    if (!opts.isCoach) {
      var posText = positionText(m.position);
      if (posText) {
        var posEl = document.createElement('div');
        posEl.className = 'roster-position';
        posEl.textContent = posText;
        info.appendChild(posEl);
      }
    }
    card.appendChild(info);

    if (!opts.isCoach && m.number) {
      var numClasses = 'roster-number';
      if (opts.isCaptain) numClasses += ' is-captain';
      else if (libero) numClasses += ' is-libero';
      var numBadge = document.createElement('div');
      numBadge.className = numClasses;
      numBadge.textContent = '#' + m.number;
      if (opts.isCaptain) numBadge.title = i18n.t(IS_WOMEN ? 'teamCaptainF' : 'teamCaptain');
      card.appendChild(numBadge);
    }
    return card;
  }

  function buildRosterTable(rows, captainIds, opts) {
    opts = opts || {};
    var showNumber = opts.showNumber !== false;
    var showPosition = opts.showPosition !== false;
    captainIds = captainIds || {};

    var table = document.createElement('table');
    table.className = 'roster-table';

    var thead = document.createElement('thead');
    var thr = document.createElement('tr');
    var headers = [];
    if (showNumber) headers.push(['rt-num', 'teamColNumber']);
    headers.push(['rt-photo', null]);
    headers.push(['rt-name', 'teamColName']);
    if (showPosition) headers.push(['rt-pos', 'teamColPosition']);
    headers.push(['rt-yob', 'teamColYob']);
    for (var h = 0; h < headers.length; h++) {
      var th = document.createElement('th');
      th.className = headers[h][0];
      th.textContent = headers[h][1] ? i18n.t(headers[h][1]) : '';
      thr.appendChild(th);
    }
    thead.appendChild(thr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      var isCaptain = captainIds[m.id] === true;
      var libero = isLibero(m);
      var tr = document.createElement('tr');
      if (isCaptain) tr.className = 'captain-row';

      if (showNumber) {
        var tdNum = document.createElement('td');
        var numCls = 'rt-num';
        if (isCaptain) numCls += ' is-captain';
        else if (libero) numCls += ' is-libero';
        tdNum.className = numCls;
        tdNum.textContent = m.number ? '#' + m.number : '';
        tr.appendChild(tdNum);
      }

      var tdPhoto = document.createElement('td');
      tdPhoto.className = 'rt-photo';
      tdPhoto.appendChild(buildAvatar(m));
      tr.appendChild(tdPhoto);

      var tdName = document.createElement('td');
      tdName.className = 'rt-name';
      tdName.textContent = m.first_name + ' ' + m.last_name;
      if (isCaptain) {
        var k = document.createElement('span');
        k.className = 'captain-badge-inline';
        k.textContent = 'K';
        k.title = i18n.t(IS_WOMEN ? 'teamCaptainF' : 'teamCaptain');
        tdName.appendChild(document.createTextNode(' '));
        tdName.appendChild(k);
      }
      tr.appendChild(tdName);

      if (showPosition) {
        var tdPos = document.createElement('td');
        tdPos.className = 'rt-pos';
        tdPos.textContent = positionText(m.position) || '';
        tr.appendChild(tdPos);
      }

      var tdYob = document.createElement('td');
      tdYob.className = 'rt-yob';
      tdYob.textContent = m.yob || '';
      tr.appendChild(tdYob);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  // ── Render Trainings ──────────────────────────────────────────────
  function renderTrainings(trainings) {
    var el = document.getElementById('training-list');
    if (!el) return;
    if (!trainings.length) { hideSection('training'); return; }

    // Filter out cancelled and past trainings
    var today = new Date().toISOString().slice(0, 10);
    trainings = trainings.filter(function (t) {
      if (t.cancelled) return false;
      // Filter by valid_from/valid_until if present (hall_slots)
      if (t.valid_from && today < t.valid_from.slice(0, 10)) return false;
      if (t.valid_until && today > t.valid_until.slice(0, 10)) return false;
      // Filter past individual training dates
      if (t.date && t.date.slice(0, 10) < today) return false;
      return true;
    });
    if (!trainings.length) { hideSection('training'); return; }

    // Deduplicate into weekly summary (group by day + time + hall)
    var dayNames = { de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
    var dayOrder = { So: 0, Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var seen = {};
    var weekly = [];
    for (var i = 0; i < trainings.length; i++) {
      var t = trainings[i];
      var dayLabel = t.day || '';
      if (!dayLabel && t.date) {
        var lang = (i18n.getLang && i18n.getLang()) || 'de';
        var names = dayNames[lang] || dayNames.de;
        var dateObj = new Date(t.date);
        dayLabel = names[dateObj.getUTCDay()];
      }
      var startTime = (t.start_time || '').slice(0, 5);
      var endTime = (t.end_time || '').slice(0, 5);
      var hallName = t.hall_name || '';
      var key = dayLabel + '|' + startTime + '|' + endTime + '|' + hallName;
      if (!seen[key]) {
        seen[key] = true;
        weekly.push({ day: dayLabel, start: startTime, end: endTime, hall: hallName, address: t.hall_address || '' });
      }
    }
    // Sort by day of week
    weekly.sort(function (a, b) { return (dayOrder[a.day] || 0) - (dayOrder[b.day] || 0); });

    var frag = document.createDocumentFragment();
    for (var j = 0; j < weekly.length; j++) {
      var w = weekly[j];
      var row = document.createElement('div');
      row.className = 'training-item';

      var dayEl = document.createElement('span');
      dayEl.className = 'training-day';
      dayEl.textContent = w.day + ' ' + w.start + '–' + w.end;
      row.appendChild(dayEl);

      var hallEl = document.createElement('span');
      hallEl.className = 'training-hall';
      hallEl.textContent = w.hall + (w.address ? ' · ' + w.address : '');
      row.appendChild(hallEl);

      frag.appendChild(row);
    }

    el.textContent = '';
    el.appendChild(frag);
  }

  // ── Game table helpers (matches homepage format) ────────────────────

  function makeCell(content, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    if (typeof content === 'string') td.textContent = content;
    else if (content) td.appendChild(content);
    return td;
  }

  function createChip(teamShort) {
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = '#6b7280'; chip.style.color = '#fff'; chip.textContent = teamShort;
    return chip;
  }

  /** Map hook game data to the modal-compatible format */
  function toModalGame(g, teamData) {
    var scoreParts = g.score ? g.score.split(':') : [];
    var homeScore = scoreParts.length === 2 ? parseInt(scoreParts[0], 10) : 0;
    var awayScore = scoreParts.length === 2 ? parseInt(scoreParts[1], 10) : 0;
    return {
      teamShort: TEAM,
      sport: g.sport || 'volleyball',
      date: g.date,
      time: g.time || '',
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      isHome: g.isHome,
      type: g.isHome ? 'home' : 'away',
      score: g.score || null,
      homeScore: homeScore,
      awayScore: awayScore,
      status: g.score ? 'completed' : 'scheduled',
      league: g.league || (teamData && teamData.league) || '',
      season: g.season || (teamData && teamData.season) || '',
      id: g.game_id || '',
      hall: g.hall || null,
      setsJson: g.sets_json || null,
      referees: g.referees || null,
      scorerTeam: g.scorer_team || null,
      scorerName: g.scorer_name || null,
      bbOfficials: g.bb_officials || null,
      opponent: g.isHome ? g.away_team : g.home_team
    };
  }

  function formatDateLocal(iso) {
    if (!iso) return '\u2013';
    try {
      var dateOnly = iso.length > 10 ? iso.slice(0, 10) : iso;
      var d = new Date(dateOnly + 'T12:00:00');
      if (isNaN(d.getTime())) return '\u2013';
      return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return '\u2013'; }
  }

  function buildGameRow(g, showScore, teamData) {
    var tr = document.createElement('tr');
    var modalGame = toModalGame(g, teamData);
    tr._gameData = modalGame;

    // Date
    tr.appendChild(makeCell(formatDateLocal(g.date), 'gt-date'));

    // Time
    tr.appendChild(makeCell(g.time ? g.time.slice(0, 5) : '', 'gt-time'));

    // Home/Away badge
    var badge = document.createElement('span');
    badge.className = 'game-badge ' + (g.isHome ? 'home' : 'away');
    badge.textContent = g.isHome ? i18n.t('teamBadgeHome') : i18n.t('teamBadgeAway');
    tr.appendChild(makeCell(badge, 'gt-loc'));

    // Matchup
    var matchup = g.isHome
      ? ('KSCW vs ' + (g.away_team || ''))
      : ((g.home_team || '') + ' vs KSCW');
    tr.appendChild(makeCell(matchup, 'gt-matchup'));

    // Score or empty
    if (showScore && g.score) {
      var scoreSpan = document.createElement('span');
      scoreSpan.className = 'game-score';
      var scoreParts = g.score.split(':');
      var homeS = parseInt(scoreParts[0], 10);
      var awayS = parseInt(scoreParts[1], 10);
      var win = g.isHome ? homeS > awayS : awayS > homeS;
      var loss = g.isHome ? homeS < awayS : awayS < homeS;
      if (win) scoreSpan.className += ' win';
      else if (loss) scoreSpan.className += ' loss';
      scoreSpan.textContent = g.score;
      tr.appendChild(makeCell(scoreSpan, 'gt-score'));
    } else {
      tr.appendChild(makeCell('', 'gt-score'));
    }

    return tr;
  }

  function renderGameTable(containerId, games, showScore, teamData) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.textContent = '';

    if (!games.length) {
      var p = document.createElement('p');
      p.className = 'text-muted text-sm';
      p.textContent = showScore ? i18n.t('teamNoResults') : i18n.t('teamNoGames');
      container.appendChild(p);
      return;
    }

    var table = document.createElement('table');
    table.className = 'game-table';
    var tbody = document.createElement('tbody');
    for (var i = 0; i < games.length; i++) {
      tbody.appendChild(buildGameRow(games[i], showScore, teamData));
    }
    table.appendChild(tbody);
    container.appendChild(table);

    // Click → modal
    table.addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (tr && tr._gameData && window.showGameModal) {
        var locale = (i18n.getLang && i18n.getLang()) || 'de';
        window.showGameModal(tr._gameData, locale);
      }
    });
  }

  // ── Render Games from hook response ─────────────────────────────────
  function renderHookGames(upcoming, results, teamData) {
    var upcomingSection = document.getElementById('upcoming-section');
    var resultsSection = document.getElementById('results-section');

    if (upcoming.length) {
      if (upcomingSection) upcomingSection.style.display = '';
      renderGameTable('upcoming-games', upcoming, false, teamData);
    } else {
      if (upcomingSection) upcomingSection.style.display = 'none';
    }

    if (results.length) {
      if (resultsSection) resultsSection.style.display = '';
      renderGameTable('recent-results', results, true, teamData);
    } else {
      if (resultsSection) resultsSection.style.display = 'none';
    }
  }

  // ── Render Rankings from hook response ─────────────────────────────
  function renderHookRankings(rankings, teamInfo, barrageRankings) {
    var rankEl = document.getElementById('rankings-table');
    if (!rankEl) return;
    rankEl.textContent = '';

    var barrage = barrageRankings || [];
    if (!rankings.length && !barrage.length) {
      var p = document.createElement('p');
      p.className = 'text-muted text-sm';
      p.textContent = i18n.t('teamNoRankings');
      rankEl.appendChild(p);
      return;
    }

    var myTeamId = teamInfo.team_id || '';

    // Renders one standings table under its own heading. `promoLeague` drives
    // the regular promotion/relegation colour band. When `isBarrage` is set,
    // the band instead marks the winner (rank 1, green = promoted) vs the
    // loser(s) (red), mirroring the regular Rangliste colour language.
    function appendSection(rows, label, promoLeague, isBarrage) {
      if (!rows.length) return;

      var h2 = document.createElement('h2');
      h2.style.fontSize = 'var(--text-2xl)';
      h2.style.marginBottom = 'var(--space-lg)';
      // Top margin only when a previous section was already rendered.
      if (rankEl.children.length) h2.style.marginTop = 'var(--space-2xl)';
      h2.textContent = label || i18n.t('rankingRankings');
      rankEl.appendChild(h2);

      // Detect sport from first ranking entry
      var isVB = rows[0].sport === 'volleyball';

      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      var table = document.createElement('table');

      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      var headers = ['#', i18n.t('rankingPoints'), i18n.t('rankingTeam'), i18n.t('rankingPlayed'), i18n.t('rankingWon'), i18n.t('rankingLost')];
      if (isVB) headers.push(i18n.t('rankingSets'));
      headers.forEach(function (t) {
        var th = document.createElement('th'); th.textContent = t; headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var totalTeams = rows.length;
      var tbody = document.createElement('tbody');
      for (var j = 0; j < rows.length; j++) {
        var rw = rows[j];
        var tr = document.createElement('tr');
        if (rw.team_id === myTeamId) tr.className = 'table-highlight';

        // Promotion/relegation color band (volleyball only). Barrage: rank 1
        // = green (won → promoted), the rest = red (lost). Regular league:
        // the full getPromotionColor scheme.
        var promoColor = null;
        if (isVB) {
          if (isBarrage) promoColor = rw.rank === 1 ? '#22c55e' : '#ef4444';
          else if (promoLeague) promoColor = getPromotionColor(promoLeague, rw.rank, totalTeams, rw.team_name || rw.team, IS_WOMEN, rows);
        }
        if (promoColor) {
          tr.style.borderLeft = '4px solid ' + promoColor;
        }

        // Rank
        var tdRank = document.createElement('td');
        tdRank.className = 'table-rank';
        tdRank.textContent = rw.rank != null ? rw.rank : '-';
        tr.appendChild(tdRank);

        // Points (bold)
        var tdPts = document.createElement('td');
        var strong = document.createElement('strong');
        strong.textContent = rw.points != null ? rw.points : '-';
        tdPts.appendChild(strong);
        tr.appendChild(tdPts);

        // Team name (ellipsis on overflow)
        var tdTeam = document.createElement('td');
        tdTeam.className = 'table-team';
        tdTeam.style.maxWidth = '180px';
        tdTeam.style.overflow = 'hidden';
        tdTeam.style.textOverflow = 'ellipsis';
        tdTeam.textContent = rw.team_name || rw.team || '?';
        tr.appendChild(tdTeam);

        // Played
        var tdSp = document.createElement('td');
        tdSp.textContent = rw.played != null ? rw.played : '-';
        tr.appendChild(tdSp);

        // Wins — with clear/narrow split for VB
        var tdW = document.createElement('td');
        if (isVB && (rw.wins_clear || rw.wins_narrow)) {
          tdW.textContent = (rw.won || 0);
          var wSub = document.createElement('span');
          wSub.style.fontSize = 'var(--text-xs)';
          wSub.style.color = 'var(--text-muted)';
          wSub.style.display = 'block';
          wSub.textContent = (rw.wins_clear || 0) + '/' + (rw.wins_narrow || 0);
          tdW.appendChild(wSub);
        } else {
          tdW.textContent = rw.won != null ? rw.won : '-';
        }
        tr.appendChild(tdW);

        // Losses — with clear/narrow split for VB
        var tdL = document.createElement('td');
        if (isVB && (rw.defeats_clear || rw.defeats_narrow)) {
          tdL.textContent = (rw.lost || 0);
          var lSub = document.createElement('span');
          lSub.style.fontSize = 'var(--text-xs)';
          lSub.style.color = 'var(--text-muted)';
          lSub.style.display = 'block';
          lSub.textContent = (rw.defeats_clear || 0) + '/' + (rw.defeats_narrow || 0);
          tdL.appendChild(lSub);
        } else {
          tdL.textContent = rw.lost != null ? rw.lost : '-';
        }
        tr.appendChild(tdL);

        // Sets (VB only)
        if (isVB) {
          var tdSets = document.createElement('td');
          tdSets.textContent = (rw.sets_won || 0) + ':' + (rw.sets_lost || 0);
          tr.appendChild(tdSets);
        }

        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      rankEl.appendChild(wrap);
    }

    appendSection(rankings, teamInfo.league, teamInfo.league || '', false);
    appendSection(barrage, barrage.length ? barrage[0].league : '', null, true);
  }

  // ── Promotion / relegation colors (volleyball) ─────────────────────
  // Per SVRZ Volleyballreglement 25/26 Art. 102a:
  //   1st = direct promotion (green), 2nd = barrage up (blue),
  //   2nd-to-last = barrage down (orange), last = direct relegation (red).
  // Men's league pyramid ends at 4L (no 5L for Herren per referee/scorer
  // tables in the reglement), so men's 4L is the bottom league — no down moves.
  // Talents (RTZ) teams per Art. 102a.7 cannot promote or relegate: they get
  // no color, AND they are skipped when computing who sits in a promotion or
  // relegation slot (positions shift to the next eligible team).
  function isTalentsName(n) { return !!n && /talents/i.test(n); }

  function getPromotionColor(league, rank, totalTeams, teamName, isWomen, allRankings) {
    // Skip youth, classics, cup, etc.
    if (/U\d|Jugend|Junior|Classics|Cup|Turnier|Plausch|Mini/i.test(league)) return null;
    // Talents team itself: no marker.
    if (isTalentsName(teamName)) return null;

    var m = league.match(/(\d)\.\s*Liga/i);
    if (!m) return null;
    var level = parseInt(m[1], 10);

    // Compute effective 1-based position among non-Talents teams.
    var pos = rank;
    var total = totalTeams;
    if (allRankings && allRankings.length) {
      var eligible = [];
      for (var k = 0; k < allRankings.length; k++) {
        var nm = allRankings[k].team_name || allRankings[k].team;
        if (!isTalentsName(nm)) eligible.push(allRankings[k]);
      }
      eligible.sort(function (a, b) { return a.rank - b.rank; });
      var idx = -1;
      for (var j = 0; j < eligible.length; j++) {
        if (eligible[j].rank === rank) { idx = j; break; }
      }
      if (idx === -1) return null;
      pos = idx + 1;
      total = eligible.length;
    }

    var green = '#22c55e', blue = '#3b82f6', orange = '#f97316', red = '#ef4444';

    switch (level) {
      case 5:
        // 5L is women-only and the bottom league — barrage up only.
        if (pos === 1) return green;
        if (pos === 2) return blue;
        return null;
      case 4:
        if (pos === 1) return green;
        if (pos === 2) return blue;
        // Only women's 4L has a lower league (5L) to drop into.
        if (isWomen && pos === total - 1) return orange;
        if (isWomen && pos === total) return red;
        return null;
      case 3:
        if (pos === 1) return green;
        if (pos === 2) return blue;
        if (pos === total - 1) return orange;
        if (pos === total) return red;
        return null;
      case 2:
        if (pos === 1) return green;
        if (pos === 2) return blue;
        if (pos === total || pos === total - 1) return red;
        if (pos === total - 2) return orange;
        return null;
      case 1:
        if (pos === 1) return green;
        if (pos === total) return red;
        return null;
      default:
        return null;
    }
  }

  // ── Tab switching ────────────────────────────────────────────────
  var tabBar = document.querySelector('.tab-bar');
  if (tabBar) {
    tabBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      // Update buttons
      tabBar.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      // Update panels
      document.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.remove('active');
      });
      var panel = document.querySelector('[data-tab-panel="' + tab + '"]');
      if (panel) panel.classList.add('active');
    });
  }

  // ── Image Lightbox ──────────────────────────────────────────────
  var lightboxOverlay = null;

  function openLightbox(src, alt, caption) {
    if (lightboxOverlay) closeLightbox();

    lightboxOverlay = document.createElement('div');
    lightboxOverlay.className = 'image-lightbox-overlay';

    var content = document.createElement('div');
    content.className = 'image-lightbox-content';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'image-lightbox-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', closeLightbox);
    content.appendChild(closeBtn);

    var img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    content.appendChild(img);

    if (caption) {
      var cap = document.createElement('div');
      cap.className = 'image-lightbox-caption';
      cap.textContent = caption;
      content.appendChild(cap);
    }

    lightboxOverlay.appendChild(content);
    lightboxOverlay.addEventListener('click', function (e) {
      if (e.target === lightboxOverlay) closeLightbox();
    });

    document.body.appendChild(lightboxOverlay);
    // Trigger transition
    requestAnimationFrame(function () {
      lightboxOverlay.classList.add('visible');
    });
  }

  function closeLightbox() {
    if (!lightboxOverlay) return;
    lightboxOverlay.classList.remove('visible');
    var ol = lightboxOverlay;
    setTimeout(function () { if (ol.parentNode) ol.parentNode.removeChild(ol); }, 200);
    lightboxOverlay = null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  // Delegate click on team photo and roster avatars
  document.addEventListener('click', function (e) {
    // Team photo
    var teamPhoto = e.target.closest('.team-photo');
    if (teamPhoto) {
      var fullSrc = teamPhoto.src.replace(/\?thumb=[^&]+/, '');
      openLightbox(fullSrc, teamPhoto.alt);
      return;
    }
    // Roster avatar (only img, not initials div)
    var avatar = e.target.closest('img.roster-avatar');
    if (avatar) {
      var fullSrc = avatar.src.replace(/\?thumb=[^&]+/, '');
      var card = avatar.closest('.roster-card');
      var nameEl = card && card.querySelector('.roster-name');
      var caption = nameEl ? nameEl.textContent : '';
      openLightbox(fullSrc, caption, caption);
      return;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────
  // Wait for i18n translations to load before rendering
  if (window.i18nReady) {
    window.i18nReady.then(fetchTeamData);
  } else {
    fetchTeamData();
  }

  // ── Re-render on language change ──────────────────────────────────
  document.addEventListener('langChanged', function () {
    if (window.TEAM_CONFIG && window.TEAM_CONFIG.directusId) {
      // Clear rendered content so fetchTeamData re-renders fresh
      var heroContainer = document.getElementById('team-hero-container');
      if (heroContainer) heroContainer.textContent = '';
      var photoContainer = document.getElementById('team-photo-container');
      if (photoContainer) photoContainer.textContent = '';
      var existingPhoto = document.querySelector('.team-photo');
      if (existingPhoto) existingPhoto.remove();
      var ctaContainer = document.getElementById('cta-container');
      if (ctaContainer) ctaContainer.textContent = '';
      var igContainer = document.getElementById('instagram-embed-container');
      if (igContainer) igContainer.style.display = 'none';
      var igEmbed = document.getElementById('instagram-embed');
      if (igEmbed) igEmbed.textContent = '';

      fetchTeamData();
    }
  });
})();
