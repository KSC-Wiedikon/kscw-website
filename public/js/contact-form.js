/**
 * KSCW Contact Form — Dynamic Team Dropdown + Submission
 *
 * Reads URL params (?sport=volleyball&team=H1&teamId=xxx) to pre-fill.
 * Fetches active teams from Directus when a sport subject is selected.
 * Submits to POST /kscw/contact with Turnstile CAPTCHA.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';

  var betreffSelect = document.getElementById('betreff');
  var teamGroup = document.getElementById('team-group');
  var teamSelect = document.getElementById('team-select');
  var form = document.getElementById('contact-form');
  var feedback = document.getElementById('form-feedback');
  var submitBtn = form ? form.querySelector('.form-submit') : null;

  if (!betreffSelect || !form) return;

  // ── URL Params ────────────────────────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var prefillSport = params.get('sport');
  var prefillTeamId = params.get('teamId');

  // ── Turnstile widget ──────────────────────────────────────────────
  var turnstileWidgetId = null;
  var turnstileContainer = document.getElementById('turnstile-container');

  function renderTurnstile() {
    if (!turnstileContainer || !window.turnstile) return;
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      size: 'flexible',
    });
  }

  if (window.turnstile) {
    renderTurnstile();
  } else {
    var pollCount = 0;
    var pollInterval = setInterval(function () {
      pollCount++;
      if (window.turnstile) { clearInterval(pollInterval); renderTurnstile(); }
      if (pollCount > 50) clearInterval(pollInterval);
    }, 100);
  }

  // ── Team cache ────────────────────────────────────────────────────
  var teamCache = {};
  // Selected-team lookup, keyed by the <option> value (the Directus team id —
  // the discriminator). Used to show the "not recruiting" note on change.
  var currentTeamsById = {};

  function fetchTeams(sport, callback) {
    if (teamCache[sport]) return callback(teamCache[sport]);

    // List all active teams for the sport. Teams not currently recruiting
    // (open_for_players === false) stay selectable, but show an info note so
    // the visitor knows the team is full / not looking for players.
    var url = DIRECTUS_URL + '/items/teams'
      + '?filter[sport][_eq]=' + sport
      + '&filter[active][_eq]=true'
      + '&fields=id,name,league,open_for_players,waitlist_url,waitlist_label'
      + '&sort=name'
      + '&limit=-1';

    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var teams = (data && data.data) ? data.data : [];
        teamCache[sport] = teams;
        callback(teams);
      })
      .catch(function () { callback([]); });
  }

  // ── Helper: create <option> element safely ────────────────────────
  function makeOption(value, text, disabled, selected) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    if (disabled) opt.disabled = true;
    if (selected) opt.selected = true;
    return opt;
  }

  // ── Populate team dropdown ────────────────────────────────────────
  function populateTeams(sport, teams) {
    if (!teamSelect || !teamGroup) return;

    var sportLabel = sport === 'volleyball' ? 'Volleyball' : 'Basketball';

    // Clear existing options using DOM methods
    while (teamSelect.firstChild) {
      teamSelect.removeChild(teamSelect.firstChild);
    }

    // Default placeholder
    teamSelect.appendChild(makeOption('', i18n.t('contactTeamPlaceholder'), true, true));

    // "Allgemein" option for the sport
    teamSelect.appendChild(makeOption('', i18n.t('generalTeamGeneral') + ' (' + sportLabel + ')', false, false));

    // Each team. Keep a lookup so the change handler can read open_for_players.
    currentTeamsById = {};
    for (var i = 0; i < teams.length; i++) {
      var t = teams[i];
      var label = t.name + (t.league ? ' — ' + t.league : '');
      teamSelect.appendChild(makeOption(t.id, label, false, false));
      currentTeamsById[t.id] = t;
    }

    teamGroup.style.display = '';
    updateRecruitingNote();

    // Pre-select if teamId from URL matches
    if (prefillTeamId) {
      teamSelect.value = prefillTeamId;
      prefillTeamId = null; // only apply once
      updateRecruitingNote();
    }
  }

  function hideTeamDropdown() {
    if (!teamGroup || !teamSelect) return;
    teamGroup.style.display = 'none';
    teamSelect.value = '';
    updateRecruitingNote();
  }

  // ── Team-status note (full / not recruiting) ──────────────────────
  // Shown under the team dropdown. Three states, driven by the selected team:
  //   • has a waitlist_url  → team is FULL: show a link to its waiting list and
  //     BLOCK the contact submit — a full team must not generate a coach / BB
  //     youth-coordinator email (the /kscw/contact backend enforces the same).
  //   • open_for_players === false (no waitlist) → not actively recruiting:
  //     advisory note only, submit stays enabled.
  //   • otherwise → hidden, submit enabled.
  // Created lazily so we don't have to touch the kontakt markup.
  var recruitingNote = null;
  var teamBlocksSubmit = false;

  function ensureRecruitingNote() {
    if (recruitingNote || !teamGroup) return recruitingNote;
    recruitingNote = document.createElement('p');
    recruitingNote.id = 'team-recruiting-note';
    recruitingNote.className = 'team-recruiting-note';
    recruitingNote.style.display = 'none';
    teamGroup.appendChild(recruitingNote);
    return recruitingNote;
  }

  // Only allow http(s)/mailto (and root-relative) URLs into an href — a
  // javascript: URL coming from Directus would otherwise be an XSS sink.
  /**
   * Delegates to window.kscwSafeHref (public/js/safe-href.js, loaded
   * render-blocking from BaseLayout's <head> on every page). Fails CLOSED — if
   * that file did not load we render unlinked rather than emit a URL nobody
   * vetted.
   *
   * This used to be a local copy whose `u.charAt(0) === '/'` also accepted a
   * PROTOCOL-RELATIVE `//evil.example`, which inherits the page scheme and
   * navigates off-site — the exact case the shared guard rejects explicitly
   * (audit 2026-08-08, finding 16). Two byte-identical copies of that weaker
   * check existed; SECURITY.md claimed "the pair cannot drift" while it was
   * actually a quartet. Do not reintroduce a local scheme check.
   */
  function safeUrl(value) {
    return window.kscwSafeHref ? window.kscwSafeHref(value) : '';
  }

  function setSubmitBlocked(blocked) {
    teamBlocksSubmit = blocked;
    if (submitBtn) submitBtn.disabled = blocked;
  }

  function updateRecruitingNote() {
    var note = ensureRecruitingNote();
    if (!note) return;
    var team = teamSelect ? currentTeamsById[teamSelect.value] : null;
    while (note.firstChild) note.removeChild(note.firstChild);

    var waitlistUrl = team && team.waitlist_url ? safeUrl(team.waitlist_url) : '';
    if (team && waitlistUrl) {
      // Full team → offer the waiting list, block the contact submit.
      var msg = document.createElement('span');
      msg.textContent = i18n.t('contactTeamFullWaitlist', { team: team.name });
      note.appendChild(msg);
      note.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = waitlistUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'team-waitlist-link';
      var lbl = team.waitlist_label ? String(team.waitlist_label).trim() : '';
      a.textContent = lbl || i18n.t('contactWaitlistCta');
      note.appendChild(a);
      note.style.display = '';
      setSubmitBlocked(true);
    } else if (team && team.open_for_players === false) {
      note.textContent = i18n.t('contactTeamNotRecruiting', { team: team.name });
      note.style.display = '';
      setSubmitBlocked(false);
    } else {
      note.style.display = 'none';
      setSubmitBlocked(false);
    }
  }

  if (teamSelect) {
    teamSelect.addEventListener('change', updateRecruitingNote);
  }

  // ── Betreff change handler ────────────────────────────────────────
  betreffSelect.addEventListener('change', function () {
    var val = betreffSelect.value;
    if (val === 'volleyball' || val === 'basketball') {
      fetchTeams(val, function (teams) {
        populateTeams(val, teams);
      });
    } else {
      hideTeamDropdown();
    }
  });

  // ── Pre-fill from URL params ──────────────────────────────────────
  if (prefillSport === 'volleyball' || prefillSport === 'basketball') {
    betreffSelect.value = prefillSport;
    fetchTeams(prefillSport, function (teams) {
      populateTeams(prefillSport, teams);
    });
  }

  // ── Feedback helpers ──────────────────────────────────────────────
  function showFeedback(type, msg) {
    if (!feedback) return;
    feedback.className = 'form-feedback form-feedback--' + type;
    feedback.textContent = msg;
    feedback.style.display = '';
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.style.display = 'none';
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (loading) {
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = i18n.t('contactSending');
    } else {
      submitBtn.textContent = submitBtn.dataset.originalText || i18n.t('contactSubmit');
    }
  }

  // ── Form submit ───────────────────────────────────────────────────
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideFeedback();

    // Full team selected → the waiting-list link is the only path; never POST.
    if (teamBlocksSubmit) return;

    var firstName = (document.getElementById('vorname').value || '').trim();
    var lastName = (document.getElementById('nachname').value || '').trim();
    var email = (document.getElementById('email').value || '').trim();
    var subject = betreffSelect.value;
    var teamIdVal = (teamSelect && teamGroup.style.display !== 'none') ? teamSelect.value : '';
    var message = (document.getElementById('nachricht').value || '').trim();

    // Client-side validation
    if (!firstName || !lastName) return showFeedback('error', i18n.t('contactValidationName'));
    if (!email) return showFeedback('error', i18n.t('contactValidationEmail'));
    if (!subject) return showFeedback('error', i18n.t('contactValidationSubject'));
    if (!message) return showFeedback('error', i18n.t('contactValidationMessage'));

    // Privacy consent
    var consentBox = document.getElementById('privacy-consent');
    if (consentBox && !consentBox.checked) return showFeedback('error', i18n.t('contactValidationConsent'));

    // Turnstile token
    var turnstileToken = '';
    if (window.turnstile && turnstileWidgetId !== null) {
      turnstileToken = window.turnstile.getResponse(turnstileWidgetId) || '';
    }
    if (!turnstileToken) return showFeedback('error', i18n.t('contactValidationCaptcha'));

    setLoading(true);

    fetch(DIRECTUS_URL + '/kscw/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        name: (firstName + ' ' + lastName).trim(),
        email: email,
        subject: subject,
        team_id: teamIdVal,
        message: message,
        locale: (document.documentElement.lang === 'en') ? 'en' : 'de',
        turnstile_token: turnstileToken,
      }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) {
          // Team went full between page load and submit (stale cached page) —
          // the backend rejects it; surface the waiting-list hint, not a raw error.
          if (d && d.error === 'team_full') throw new Error(i18n.t('contactTeamFullError'));
          throw new Error(d.message || i18n.t('contactError'));
        });
        return r.json();
      })
      .then(function () {
        showFeedback('success', i18n.t('contactSuccess'));
        form.reset();
        hideTeamDropdown();
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      })
      .catch(function (err) {
        showFeedback('error', err.message || i18n.t('contactErrorRetry'));
      })
      .finally(function () {
        setLoading(false);
      });
  });

  // ── Language change handler ───────────────────────────────────────
  document.addEventListener('langChanged', function () {
    if (window.i18n) {
      i18n.applyTranslations(document.querySelector('.contact-form') || document.querySelector('form'));
      var btn = document.getElementById('contact-submit') || document.querySelector('button[type="submit"]');
      if (btn && !btn.disabled) btn.textContent = i18n.t('contactSubmit');
      // Update dynamically generated select option placeholders
      var teamPlaceholder = document.querySelector('#team-select option[value=""]');
      if (teamPlaceholder) teamPlaceholder.textContent = i18n.t('contactTeamPlaceholder');
      updateRecruitingNote();
    }
  });
})();
