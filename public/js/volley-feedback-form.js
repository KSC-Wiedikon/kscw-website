/**
 * KSCW Volley Feedback Form — Autocomplete, multiselect, ratings, submission
 *
 * Submits via Directus Flow webhook (server-side Turnstile validation).
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';

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

  var FUNCTIONS = ['player', 'coach', 'team_responsible', 'other'];
  var RATINGS = ['verein', 'vorstand', 'tk_leitung', 'training', 'kommunikation'];

  // ── DOM refs ─────────────────────────────────────────────────────────
  var form = document.getElementById('volley-feedback-form');
  if (!form) return;

  var feedback = document.getElementById('vf-feedback');
  var submitBtn = form.querySelector('.form-submit');
  var identitySection = document.getElementById('vf-identity-section');
  var anonToggle = document.getElementById('vf-anonymous');
  var nameInput = document.getElementById('vf-name');
  var nameDropdown = document.getElementById('vf-name-dropdown');
  var teamSearchInput = document.getElementById('vf-team-search');
  var teamDropdown = document.getElementById('vf-team-dropdown');
  var teamTagsContainer = document.getElementById('vf-team-tags');
  var teamOtherInput = document.getElementById('vf-other-team-input');
  var funcOtherInput = document.getElementById('vf-other-function-input');

  // ── i18n ─────────────────────────────────────────────────────────────
  function getLocale() {
    return (document.documentElement.lang === 'en') ? 'en' : 'de';
  }

  // Group labels from i18n data attributes on the page
  var groupLabels = {};
  var teamDropdownEl = document.getElementById('vf-team-dropdown');
  if (teamDropdownEl) {
    groupLabels.herren = teamDropdownEl.getAttribute('data-label-herren') || 'Herren';
    groupLabels.damen = teamDropdownEl.getAttribute('data-label-damen') || 'Damen';
    groupLabels.nachwuchs = teamDropdownEl.getAttribute('data-label-nachwuchs') || 'Nachwuchs';
  }

  // ── State ────────────────────────────────────────────────────────────
  var isAnonymous = false;
  var selectedFunctions = [];
  var selectedTeams = [];
  var selectedRatings = {};
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

  // ── Fetch member data (name + functions + teams) ──────────────────────
  var memberData = []; // Full objects: { name, functions, teams }

  // Map Directus team names to chipLabels
  var teamNameToChip = {};
  TEAMS.forEach(function (t) { teamNameToChip[t.name] = t.chip; teamNameToChip[t.chip] = t.chip; });

  function fetchMemberNames() {
    fetch(DIRECTUS_URL + '/flows/trigger/531dc3c2-64ec-4a7e-a989-da983d3530e4')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (data) {
        memberData = (data || []).filter(function (m) { return m.name; });
        memberNames = memberData.map(function (m) { return m.name; });
      })
      .catch(function () { memberData = []; memberNames = []; });
  }
  fetchMemberNames();

  // ── Anonymous toggle ─────────────────────────────────────────────────
  if (anonToggle) {
    anonToggle.addEventListener('change', function () {
      isAnonymous = anonToggle.checked;
      if (identitySection) {
        identitySection.style.maxHeight = isAnonymous ? '0' : identitySection.scrollHeight + 'px';
        identitySection.style.opacity = isAnonymous ? '0' : '1';
        identitySection.style.overflow = 'hidden';
      }
    });
  }

  // ── Name autocomplete ────────────────────────────────────────────────
  var nameDebounce = null;
  if (nameInput && nameDropdown) {
    nameInput.addEventListener('input', function () {
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
          div.className = 'vf-dropdown-item';
          div.textContent = name;
          div.addEventListener('click', function () {
            nameInput.value = name;
            nameDropdown.hidden = true;
            // Auto-fill functions and teams from member data
            var member = memberData.find(function (m) { return m.name === name; });
            if (member) {
              // Auto-fill functions
              if (member.functions && member.functions.length > 0) {
                selectedFunctions = member.functions.slice();
                funcChips.forEach(function (chip) {
                  var func = chip.getAttribute('data-func');
                  chip.classList.toggle('active', selectedFunctions.indexOf(func) !== -1);
                });
              }
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

  // ── Function chips (multiselect toggle) ──────────────────────────────
  var funcChips = document.querySelectorAll('.vf-func-chip');
  funcChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var func = chip.getAttribute('data-func');
      var idx = selectedFunctions.indexOf(func);
      if (idx === -1) {
        selectedFunctions.push(func);
        chip.classList.add('active');
      } else {
        selectedFunctions.splice(idx, 1);
        chip.classList.remove('active');
      }
      // Show/hide "other" text input
      if (func === 'other' && funcOtherInput) {
        funcOtherInput.hidden = idx !== -1 ? true : false;
      }
    });
  });

  // ── Team dropdown multiselect with search ────────────────────────────
  var teamDropdownOpen = false;

  function renderTeamTags() {
    if (!teamTagsContainer) return;
    // Clear existing tags (keep search input)
    var existing = teamTagsContainer.querySelectorAll('.vf-team-tag');
    existing.forEach(function (el) { el.remove(); });
    selectedTeams.forEach(function (chipLabel) {
      var team = TEAMS.find(function (t) { return t.chip === chipLabel; });
      if (!team) return;
      var tag = document.createElement('span');
      tag.className = 'vf-team-tag';
      tag.style.backgroundColor = team.bg;
      tag.style.color = team.text;
      tag.textContent = team.chip + ' ';
      var x = document.createElement('span');
      x.className = 'vf-team-tag-remove';
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
      header.className = 'vf-dropdown-group';
      header.textContent = groupLabels[g] || g;
      teamDropdown.appendChild(header);

      filtered.forEach(function (team) {
        var isSelected = selectedTeams.indexOf(team.chip) !== -1;
        var item = document.createElement('div');
        item.className = 'vf-dropdown-item' + (isSelected ? ' selected' : '');
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

    // "Andere" option
    var otherItem = document.createElement('div');
    otherItem.className = 'vf-dropdown-item vf-dropdown-other';
    otherItem.textContent = teamDropdown.getAttribute('data-label-other') || '+ Andere eingeben...';
    otherItem.addEventListener('click', function () {
      if (teamOtherInput) {
        teamOtherInput.hidden = false;
        teamOtherInput.querySelector('input').focus();
      }
      closeTeamDropdown();
    });
    teamDropdown.appendChild(otherItem);

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

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var wrapper = document.getElementById('vf-team-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeTeamDropdown();
    }
    if (nameDropdown && nameInput && !nameInput.contains(e.target) && !nameDropdown.contains(e.target)) {
      nameDropdown.hidden = true;
    }
  });

  // ── Rating boxes ─────────────────────────────────────────────────────
  var ratingContainers = document.querySelectorAll('.vf-rating-row');
  ratingContainers.forEach(function (row) {
    var category = row.getAttribute('data-rating');
    var boxes = row.querySelectorAll('.vf-rating-box');
    boxes.forEach(function (box) {
      box.addEventListener('click', function () {
        var val = parseInt(box.getAttribute('data-value'), 10);
        if (selectedRatings[category] === val) {
          // Deselect
          delete selectedRatings[category];
          boxes.forEach(function (b) { b.classList.remove('active'); });
        } else {
          selectedRatings[category] = val;
          boxes.forEach(function (b) {
            b.classList.toggle('active', parseInt(b.getAttribute('data-value'), 10) === val);
          });
        }
      });
    });
  });

  // ── Validation ───────────────────────────────────────────────────────
  function validate() {
    var hasRating = Object.keys(selectedRatings).length > 0;
    var feedbackText = form.querySelector('#vf-feedback-text');
    var ideasText = form.querySelector('#vf-ideas-text');
    var otherText = form.querySelector('#vf-other-text');
    var hasText = (feedbackText && feedbackText.value.trim()) ||
                  (ideasText && ideasText.value.trim()) ||
                  (otherText && otherText.value.trim());

    if (!hasRating && !hasText) {
      showFeedback(form.getAttribute('data-msg-empty') || 'Please fill in at least one rating or text field', 'error');
      return null;
    }

    var turnstileResponse = window.turnstile ? window.turnstile.getResponse(turnstileWidgetId) : null;
    if (!turnstileResponse) {
      showFeedback(form.getAttribute('data-msg-captcha') || 'Please confirm you are not a robot', 'error');
      return null;
    }

    return { turnstileResponse: turnstileResponse };
  }

  // ── Submit ───────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideFeedback();

    var data = validate();
    if (!data) return;

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '...'; }

    var payload = {
      season: '2025/2026',
      is_anonymous: isAnonymous,
      locale: getLocale(),
      rating_verein: selectedRatings.verein || null,
      rating_vorstand: selectedRatings.vorstand || null,
      rating_tk_leitung: selectedRatings.tk_leitung || null,
      rating_training: selectedRatings.training || null,
      rating_kommunikation: selectedRatings.kommunikation || null,
      feedback_text: (form.querySelector('#vf-feedback-text') || {}).value || null,
      ideas_text: (form.querySelector('#vf-ideas-text') || {}).value || null,
      other_text: (form.querySelector('#vf-other-text') || {}).value || null,
    };

    if (!isAnonymous) {
      payload.name = nameInput ? nameInput.value.trim() || null : null;
      payload.functions = selectedFunctions.length > 0 ? selectedFunctions : null;
      payload.teams = selectedTeams.length > 0 ? selectedTeams : null;
      var otherFuncField = form.querySelector('#vf-other-function');
      payload.other_function = (otherFuncField && otherFuncField.value.trim()) || null;
      var otherTeamField = form.querySelector('#vf-other-team');
      payload.other_team = (otherTeamField && otherTeamField.value.trim()) || null;
    }

    // Trim null values
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === null || payload[k] === '') delete payload[k];
    });

    payload.turnstile_token = data.turnstileResponse;

    fetch(DIRECTUS_URL + '/flows/trigger/d523d4a2-9dff-4dd5-b007-ec8991ef6392', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          success.className = 'vf-success';

          // Static success icon
          var iconWrap = document.createElement('div');
          iconWrap.className = 'vf-success-icon';
          iconWrap.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4A55A2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
          success.appendChild(iconWrap);

          // WEB-SEC-7: dynamic message via textContent so it can never be
          // interpreted as HTML regardless of source.
          var titleEl = document.createElement('h2');
          titleEl.textContent = form.getAttribute('data-msg-success') || 'Thank you!';
          success.appendChild(titleEl);

          var textEl = document.createElement('p');
          textEl.textContent = form.getAttribute('data-msg-success-text') || '';
          success.appendChild(textEl);

          wrapper.replaceChild(success, form);
        }
      })
      .catch(function (err) {
        showFeedback(form.getAttribute('data-msg-error') || 'Something went wrong.', 'error');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.getAttribute('data-label') || 'Submit';
        }
      });
  });

  // ── Feedback UI ──────────────────────────────────────────────────────
  function showFeedback(text, type) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = 'vf-feedback ' + type;
    feedback.hidden = false;
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.className = 'vf-feedback';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Init identity section height ─────────────────────────────────────
  if (identitySection) {
    identitySection.style.maxHeight = identitySection.scrollHeight + 'px';
    identitySection.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    identitySection.style.opacity = '1';
  }
})();
