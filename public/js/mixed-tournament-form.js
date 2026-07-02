/**
 * KSCW Mixed Tournament Signup Form — Autocomplete, multiselect, positions, submission
 *
 * Submits to POST /items/event_signups on Directus with a polymorphic form_data field.
 * Fixed event=5 (Mixed Turnier 2026) and form_slug='mixed_tournament_2026'.
 * Includes Turnstile CAPTCHA token in header.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';
  var CHECK_SIGNUP_FLOW = '06f65be0-646b-443c-8ebf-5173e467779e';

  // ── Volleyball teams (from teams.ts) ─────────────────────────────────
  var TEAMS = [
    { group: 'herren', chip: 'H1', name: 'Herren 1', bg: '#1e40af', text: '#ffffff' },
    { group: 'herren', chip: 'H2', name: 'Herren 2', bg: '#2563eb', text: '#ffffff' },
    { group: 'herren', chip: 'H3', name: 'Herren 3', bg: '#3b82f6', text: '#ffffff' },
    { group: 'herren', chip: 'Legends', name: 'Legends', bg: '#1e3a5f', text: '#ffffff' },
    { group: 'damen', chip: 'D1', name: 'Damen 1', bg: '#be123c', text: '#ffffff' },
    { group: 'damen', chip: 'D2', name: 'Damen 2', bg: '#e11d48', text: '#ffffff' },
    { group: 'damen', chip: 'D3', name: 'Damen 3', bg: '#f43f5e', text: '#1a1a2e' },
    { group: 'damen', chip: 'D4', name: 'Damen 4', bg: '#fb7185', text: '#1a1a2e' },
    { group: 'nachwuchs', chip: 'DU23-1', name: 'Damen U23-1', bg: '#fda4af', text: '#881337' },
    { group: 'nachwuchs', chip: 'DU23-2', name: 'Damen U23-2', bg: '#fda4af', text: '#881337' },
    { group: 'nachwuchs', chip: 'HU23', name: 'Herren U23', bg: '#60a5fa', text: '#1e3a8a' },
    { group: 'nachwuchs', chip: 'HU20', name: 'Herren U20', bg: '#93c5fd', text: '#1e3a8a' },
  ];

  // ── DOM refs ─────────────────────────────────────────────────────────
  var form = document.getElementById('mt-form');
  if (!form) return;

  var feedback = document.getElementById('mt-feedback');
  var submitBtn = form.querySelector('.form-submit');
  var nameInput = document.getElementById('mt-name');
  var nameDropdown = document.getElementById('mt-name-dropdown');
  var emailInput = document.getElementById('mt-email');
  var sexSelect = document.getElementById('mt-sex');
  var teamSearchInput = document.getElementById('mt-team-search');
  var teamDropdown = document.getElementById('mt-team-dropdown');
  var teamTagsContainer = document.getElementById('mt-team-tags');
  var pos1Select = document.getElementById('mt-pos1');
  var pos2Select = document.getElementById('mt-pos2');
  var pos3Select = document.getElementById('mt-pos3');
  var notesInput = document.getElementById('mt-notes');
  var modal = document.getElementById('mt-modal');
  var modalSignupBtn = document.getElementById('mt-modal-signup');
  var modalLaterBtn = document.getElementById('mt-modal-later');

  // ── i18n ─────────────────────────────────────────────────────────────
  // Group labels from i18n data attributes on the page
  var groupLabels = {};
  var teamDropdownEl = document.getElementById('mt-team-dropdown');
  if (teamDropdownEl) {
    groupLabels.herren = teamDropdownEl.getAttribute('data-label-herren') || 'Herren';
    groupLabels.damen = teamDropdownEl.getAttribute('data-label-damen') || 'Damen';
    groupLabels.nachwuchs = teamDropdownEl.getAttribute('data-label-nachwuchs') || 'Nachwuchs';
  }

  // ── State ────────────────────────────────────────────────────────────
  var isMember = false;
  var memberId = null;
  var wiedisyncActive = false;
  var alreadySignedUp = false;
  var selectedTeams = [];
  var memberData = []; // Full objects: { id, name, functions, teams, sex, wiedisync_active }
  var memberNames = [];

  // ── Turnstile ────────────────────────────────────────────────────────
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
    var poll = setInterval(function () {
      pollCount++;
      if (window.turnstile) { clearInterval(poll); renderTurnstile(); }
      else if (pollCount > 20) { clearInterval(poll); }
    }, 500);
  }

  // ── Fetch member data (id + name + functions + teams + sex) ──────────
  // Map Directus team names to chipLabels
  var teamNameToChip = {};
  TEAMS.forEach(function (t) { teamNameToChip[t.name] = t.chip; teamNameToChip[t.chip] = t.chip; });

  function fetchMemberNames() {
    // SECURITY FOLLOW-UP (server-side): this UNAUTHENTICATED Directus Flow returns
    // the full member directory (id, name, sex, teams, wiedisync_active) and so
    // bypasses the scoped public members read (website_visible=true + adults only),
    // leaking minors / opted-out members plus internal member ids. The real fix is
    // in the Flow itself (not in this repo): scope it to the public policy —
    // website_visible + adults, and drop `id`. Tracked as a follow-up. Note the
    // member `id` is still used here for the already-signed-up check + submission
    // linkage below, so it can only be dropped once the Flow returns an opaque
    // lookup key instead. Do not widen this call's usage of the response.
    fetch(DIRECTUS_URL + '/flows/trigger/531dc3c2-64ec-4a7e-a989-da983d3530e4')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (data) {
        memberData = (data || []).filter(function (m) { return m.name; });
        memberNames = memberData.map(function (m) { return m.name; });
      })
      .catch(function () { memberData = []; memberNames = []; });
  }
  fetchMemberNames();

  // ── Name autocomplete ────────────────────────────────────────────────
  var nameDebounce = null;
  if (nameInput && nameDropdown) {
    nameInput.addEventListener('input', function () {
      // Reset member state when user types after selecting
      isMember = false;
      memberId = null;
      wiedisyncActive = false;
      alreadySignedUp = false;
      hideFeedback();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }

      clearTimeout(nameDebounce);
      nameDebounce = setTimeout(function () {
        var val = nameInput.value.trim().toLowerCase();
        if (val.length < 2) { nameDropdown.hidden = true; return; }
        var matches = memberNames.filter(function (n) {
          return n.toLowerCase().indexOf(val) !== -1;
        }).slice(0, 8);
        if (matches.length === 0) { nameDropdown.hidden = true; return; }
        nameDropdown.textContent = '';
        matches.forEach(function (name) {
          var div = document.createElement('div');
          div.className = 'mt-dropdown-item';
          div.textContent = name;
          div.addEventListener('click', function () {
            nameInput.value = name;
            nameDropdown.hidden = true;
            // Set member state
            var member = memberData.find(function (m) { return m.name === name; });
            if (member) {
              isMember = true;
              memberId = member.id || null;
              wiedisyncActive = !!member.wiedisync_active;
              // Auto-fill teams
              if (member.teams && member.teams.length > 0) {
                selectedTeams = [];
                member.teams.forEach(function (t) {
                  var chip = teamNameToChip[t];
                  if (chip && selectedTeams.indexOf(chip) === -1) selectedTeams.push(chip);
                });
                renderTeamTags();
                renderTeamDropdown();
              }
              // Auto-fill sex
              if (member.sex && sexSelect) {
                var sexVal = normalizeSex(member.sex);
                sexSelect.value = sexVal;
              }
              // Check if already signed up (via Wiedisync RSVP or earlier website submission)
              if (memberId) {
                fetch(DIRECTUS_URL + '/flows/trigger/' + CHECK_SIGNUP_FLOW + '?member_id=' + memberId)
                  .then(function (r) { return r.ok ? r.json() : null; })
                  .then(function (result) {
                    if (result && result.signed_up) {
                      alreadySignedUp = true;
                      var msg = form.getAttribute('data-msg-already-wiedisync')
                        || (document.documentElement.lang === 'en'
                          ? "You're already signed up for the Mixed Tournament via Wiedisync — no further sign-up needed!"
                          : 'Du bist bereits via Wiedisync für das Mixed-Turnier angemeldet — keine weitere Anmeldung nötig!');
                      showFeedback(msg, 'info');
                      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
                    }
                  })
                  .catch(function () {});
              }
            }
          });
          nameDropdown.appendChild(div);
        });
        nameDropdown.hidden = false;
      }, 150);
    });

    nameInput.addEventListener('blur', function () {
      setTimeout(function () { nameDropdown.hidden = true; }, 200);
    });

    nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') nameDropdown.hidden = true;
    });
  }

  // ── Sex normalization ────────────────────────────────────────────────
  // Sex values stored as German lowercase: männlich / weiblich
  function normalizeSex(val) {
    if (!val) return '';
    var v = val.toLowerCase().trim();
    if (v === 'male' || v === 'männlich' || v === 'maennlich' || v === 'm') return 'männlich';
    if (v === 'female' || v === 'weiblich' || v === 'w' || v === 'f') return 'weiblich';
    return v;
  }

  // ── Position dropdowns — disable already-selected values in others ───
  var posSelects = [pos1Select, pos2Select, pos3Select].filter(Boolean);

  function updatePositionOptions() {
    var selected = posSelects.map(function (s) { return s.value; });
    posSelects.forEach(function (sel, i) {
      var currentVal = sel.value;
      var otherSelected = selected.filter(function (v, idx) { return idx !== i && v !== ''; });
      Array.prototype.forEach.call(sel.options, function (opt) {
        if (opt.value === '') return; // never disable the placeholder
        opt.disabled = otherSelected.indexOf(opt.value) !== -1;
      });
    });
  }

  posSelects.forEach(function (sel) {
    sel.addEventListener('change', updatePositionOptions);
  });

  // ── Team dropdown multiselect with search ────────────────────────────
  var teamDropdownOpen = false;

  function renderTeamTags() {
    if (!teamTagsContainer) return;
    // Clear existing tags (keep search input)
    var existing = teamTagsContainer.querySelectorAll('.mt-team-tag');
    existing.forEach(function (el) { el.remove(); });
    selectedTeams.forEach(function (chipLabel) {
      var team = TEAMS.find(function (t) { return t.chip === chipLabel; });
      if (!team) return;
      var tag = document.createElement('span');
      tag.className = 'mt-team-tag';
      tag.style.backgroundColor = team.bg;
      tag.style.color = team.text;
      tag.textContent = team.chip + ' ';
      var x = document.createElement('span');
      x.className = 'mt-team-tag-remove';
      x.textContent = '\u00d7';
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        var i = selectedTeams.indexOf(chipLabel);
        if (i !== -1) selectedTeams.splice(i, 1);
        renderTeamTags();
        renderTeamDropdown();
      });
      tag.appendChild(x);
      teamTagsContainer.insertBefore(tag, teamSearchInput);
    });
  }

  function renderTeamDropdown() {
    if (!teamDropdown) return;
    var query = (teamSearchInput ? teamSearchInput.value : '').toLowerCase();
    teamDropdown.textContent = '';
    var groups = ['herren', 'damen', 'nachwuchs'];
    var hasResults = false;

    groups.forEach(function (g) {
      var filtered = TEAMS.filter(function (t) {
        return t.group === g && (
          t.chip.toLowerCase().indexOf(query) !== -1 ||
          t.name.toLowerCase().indexOf(query) !== -1
        );
      });
      if (filtered.length === 0) return;
      hasResults = true;
      var header = document.createElement('div');
      header.className = 'mt-dropdown-group';
      header.textContent = groupLabels[g] || g;
      teamDropdown.appendChild(header);

      filtered.forEach(function (team) {
        var isSelected = selectedTeams.indexOf(team.chip) !== -1;
        var item = document.createElement('div');
        item.className = 'mt-dropdown-item' + (isSelected ? ' selected' : '');
        item.textContent = team.chip + ' \u2014 ' + team.name;
        if (isSelected) {
          item.style.opacity = '0.5';
          item.style.textDecoration = 'line-through';
        }
        item.addEventListener('click', function () {
          if (isSelected) {
            var idx = selectedTeams.indexOf(team.chip);
            if (idx !== -1) selectedTeams.splice(idx, 1);
          } else {
            selectedTeams.push(team.chip);
          }
          renderTeamTags();
          renderTeamDropdown();
          if (teamSearchInput) { teamSearchInput.value = ''; teamSearchInput.focus(); }
        });
        teamDropdown.appendChild(item);
      });
    });

    if (!hasResults && !query) teamDropdown.hidden = true;
  }

  function openTeamDropdown() {
    if (teamDropdownOpen) return;
    teamDropdownOpen = true;
    if (teamDropdown) teamDropdown.hidden = false;
    renderTeamDropdown();
  }

  function closeTeamDropdown() {
    teamDropdownOpen = false;
    if (teamDropdown) teamDropdown.hidden = true;
  }

  if (teamSearchInput) {
    teamSearchInput.addEventListener('focus', openTeamDropdown);
    teamSearchInput.addEventListener('input', function () {
      openTeamDropdown();
      renderTeamDropdown();
    });
    teamSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTeamDropdown();
    });
  }

  // Click on tags container opens dropdown
  if (teamTagsContainer) {
    teamTagsContainer.addEventListener('click', function (e) {
      if (e.target === teamTagsContainer || e.target === teamSearchInput) {
        if (teamSearchInput) teamSearchInput.focus();
        openTeamDropdown();
      }
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', function (e) {
    var wrapper = document.getElementById('mt-team-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeTeamDropdown();
    }
    if (nameDropdown && nameInput && !nameInput.contains(e.target) && !nameDropdown.contains(e.target)) {
      nameDropdown.hidden = true;
    }
  });

  // ── Wiedisync nudge modal ────────────────────────────────────────────
  function showModal() {
    if (modal) modal.hidden = false;
  }

  function hideModal() {
    if (modal) modal.hidden = true;
  }

  if (modalSignupBtn) {
    modalSignupBtn.addEventListener('click', function () {
      var signupUrl = 'https://wiedisync.kscw.ch/signup';
      var email = emailInput ? emailInput.value.trim() : '';
      if (email) signupUrl += '?email=' + encodeURIComponent(email);
      window.open(signupUrl, '_blank');
      hideModal();
      doSubmit();
    });
  }

  if (modalLaterBtn) {
    modalLaterBtn.addEventListener('click', function () {
      hideModal();
      doSubmit();
    });
  }

  // No close-on-backdrop-click for the modal

  // ── Validation ───────────────────────────────────────────────────────
  function validate() {
    if (alreadySignedUp) {
      var msg = form.getAttribute('data-msg-already-wiedisync')
        || (document.documentElement.lang === 'en'
          ? "You're already signed up for the Mixed Tournament via Wiedisync — no further sign-up needed!"
          : 'Du bist bereits via Wiedisync für das Mixed-Turnier angemeldet — keine weitere Anmeldung nötig!');
      showFeedback(msg, 'info');
      return null;
    }

    var name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showFeedback(form.getAttribute('data-msg-name') || 'Please enter your name', 'error');
      return null;
    }

    var email = emailInput ? emailInput.value.trim() : '';
    if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
      showFeedback(form.getAttribute('data-msg-email') || 'Please enter a valid email address', 'error');
      return null;
    }

    var sex = sexSelect ? sexSelect.value : '';
    if (!sex) {
      showFeedback(form.getAttribute('data-msg-sex') || 'Please select your sex', 'error');
      return null;
    }

    var pos1 = pos1Select ? pos1Select.value : '';
    if (!pos1) {
      showFeedback(form.getAttribute('data-msg-pos') || 'Please select your primary position', 'error');
      return null;
    }

    // Positions must be unique (no duplicates among non-empty values)
    var pos2 = pos2Select ? pos2Select.value : '';
    var pos3 = pos3Select ? pos3Select.value : '';
    var filledPositions = [pos1, pos2, pos3].filter(function (p) { return p !== ''; });
    var uniquePositions = filledPositions.filter(function (p, i) { return filledPositions.indexOf(p) === i; });
    if (uniquePositions.length !== filledPositions.length) {
      showFeedback(form.getAttribute('data-msg-pos-duplicate') || 'Positions must be different', 'error');
      return null;
    }

    var turnstileResponse = window.turnstile ? window.turnstile.getResponse(turnstileWidgetId) : null;
    if (!turnstileResponse) {
      showFeedback(form.getAttribute('data-msg-captcha') || 'Please confirm you are not a robot', 'error');
      return null;
    }

    return {
      name: name,
      email: email,
      sex: normalizeSex(sex),
      position_1: pos1,
      position_2: pos2 || null,
      position_3: pos3 || null,
      turnstileResponse: turnstileResponse,
    };
  }

  // ── Submit ───────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideFeedback();

    var data = validate();
    if (!data) return;

    // If member with active Wiedisync: submit directly (no popup)
    // If member without Wiedisync: show nudge modal
    if (isMember && !wiedisyncActive) {
      // Store validated data for modal callbacks to use
      form._pendingData = data;
      showModal();
    } else {
      form._pendingData = data;
      doSubmit();
    }
  });

  function doSubmit() {
    var data = form._pendingData;
    if (!data) return;
    form._pendingData = null;

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '...'; }

    var formData = {};
    formData.position_1 = data.position_1;
    if (data.position_2) formData.position_2 = data.position_2;
    if (data.position_3) formData.position_3 = data.position_3;
    if (selectedTeams.length > 0) formData.teams = selectedTeams;
    if (notesInput && notesInput.value.trim()) formData.notes = notesInput.value.trim();

    var payload = {
      event: 5,
      form_slug: 'mixed_tournament_2026',
      name: data.name,
      email: data.email,
      sex: data.sex,
      is_member: isMember,
      member: (isMember && memberId) ? memberId : null,
      form_data: formData,
    };

    fetch(DIRECTUS_URL + '/items/event_signups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': data.turnstileResponse,
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (text) { try { var err = JSON.parse(text); throw new Error(err.message || 'HTTP ' + res.status); } catch(e) { throw new Error('HTTP ' + res.status); } });
        return res.status === 204 ? {} : res.json();
      })
      .then(function () {
        // Replace form with success message
        var wrapper = form.parentElement;
        if (wrapper) {
          var success = document.createElement('div');
          success.className = 'mt-success';
          var isEn = document.documentElement.lang === 'en';

          var card = document.createElement('div');
          card.className = 'mt-success-card';

          // Static success icon
          var iconWrap = document.createElement('div');
          iconWrap.className = 'mt-success-icon';
          iconWrap.innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke="#4A55A2" fill="rgba(74,85,162,0.1)"/><path d="m9 12 2 2 4-4" stroke="#4A55A2"/></svg>';
          card.appendChild(iconWrap);

          // WEB-SEC-7: dynamic message via textContent so it can never be
          // interpreted as HTML regardless of source.
          var titleEl = document.createElement('h2');
          titleEl.className = 'mt-success-title';
          titleEl.textContent = form.getAttribute('data-msg-success') || 'Thank you!';
          card.appendChild(titleEl);

          var textEl = document.createElement('p');
          textEl.className = 'mt-success-text';
          textEl.textContent = form.getAttribute('data-msg-success-text') || '';
          card.appendChild(textEl);

          if (isMember) {
            var badge = document.createElement('div');
            badge.className = 'mt-success-badge';
            badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/></svg>' + (isEn ? 'Participation saved in Wiedisync' : 'Teilnahme in Wiedisync gespeichert');
            card.appendChild(badge);
          }

          var actions = document.createElement('div');
          actions.className = 'mt-success-actions';
          actions.innerHTML = '<a href="/mixed-turnier-2026.ics" class="mt-success-cal" download>' + (isEn ? 'Add to Calendar' : 'Zum Kalender hinzuf\u00FCgen') + '</a>';
          card.appendChild(actions);

          success.appendChild(card);
          wrapper.replaceChild(success, form);
        }
      })
      .catch(function (err) {
        console.error('[mt-form] Submit error:', err, err && err.message, err && err.stack);
        showFeedback(form.getAttribute('data-msg-error') || 'Something went wrong.', 'error');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.getAttribute('data-label') || 'Submit';
        }
        // Reset Turnstile so the token is fresh for retries
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      });
  }

  // ── Feedback UI ──────────────────────────────────────────────────────
  function showFeedback(text, type) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = 'mt-feedback ' + type;
    feedback.hidden = false;
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.className = 'mt-feedback';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
})();
