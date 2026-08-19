/**
 * Scorer-exam scoresheet upload (/weiteres/schreiberkurse/pruefung).
 *
 * Two steps: prove which registration you are (email → signed ticket), then send the
 * bytes. The ticket is minted and verified server-side (scorer-exam.js); this file
 * never decides who anyone is, it only carries the ticket back.
 *
 * ⚠ The upload puts ticket + filename in the QUERY STRING, not in request headers.
 * Directus answers preflight with `access-control-allow-headers: Content-Type,
 * Authorization, X-Turnstile-Token`, so a custom header is blocked by the browser
 * before the request leaves — and curl, which skips preflight, would not reveal it.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';
  var MAX_BYTES = 10 * 1024 * 1024; // keep in sync with UPLOAD_MAX_BYTES in scorer-exam.js

  var emailForm = document.getElementById('exam-email-form');
  if (!emailForm) return;

  var stepEmail = document.getElementById('exam-step-email');
  var stepFile = document.getElementById('exam-step-file');
  var stepDone = document.getElementById('exam-step-done');
  var emailInput = document.getElementById('exam-email');
  var emailSubmit = document.getElementById('exam-email-submit');
  var fileForm = document.getElementById('exam-file-form');
  var fileInput = document.getElementById('exam-file');
  var fileSubmit = document.getElementById('exam-file-submit');
  var licenceInput = document.getElementById('exam-licence');
  var licenceHelp = document.querySelector('label[for="exam-licence"] ~ .exam-help');
  var greeting = document.getElementById('exam-greeting');
  var courseGroup = document.getElementById('exam-course-group');
  var courseSelect = document.getElementById('exam-course');
  var already = document.getElementById('exam-already');
  var feedback = document.getElementById('exam-feedback');
  var againBtn = document.getElementById('exam-again');
  var turnstileHost = document.getElementById('exam-turnstile');

  var matches = [];
  var turnstileWidgetId = null;

  function t(key, params) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key;
  }

  /** dd.mm.yyyy — Swiss dot format in both languages (see CLAUDE.md → Time & date). */
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Tagging the node with data-i18n lets the language toggle re-translate it in place,
  // exactly like server-rendered copy.
  function setText(el, key) {
    el.textContent = t(key);
    el.setAttribute('data-i18n', key);
  }

  function showError(key) {
    feedback.hidden = false;
    feedback.setAttribute('data-kind', 'error');
    setText(feedback, key);
  }

  function clearError() {
    feedback.hidden = true;
    feedback.removeAttribute('data-kind');
    feedback.textContent = '';
    feedback.removeAttribute('data-i18n');
  }

  /* ── Turnstile ─────────────────────────────────────────────── */

  function renderTurnstile() {
    if (!turnstileHost || !window.turnstile || turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileHost, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      size: 'flexible',
      // Resilience: auto-refresh an expired token and auto-retry transient
      // challenge failures (the 300xxx / 600xxx client-side errors some mobile
      // browsers and privacy blockers throw) instead of dead-ending the visitor
      // with a widget that never yields a token (prod, 19.08.2026).
      'refresh-expired': 'auto',
      retry: 'auto',
      'retry-interval': 3000,
      'expired-callback': function () {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) { /* noop */ }
      },
      'timeout-callback': function () {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) { /* noop */ }
      },
      'error-callback': function (code) {
        // Returning true tells Turnstile we handled it, which suppresses the
        // "Uncaught TurnstileError" and lets retry:'auto' recover.
        try { console.error('[scorer-exam] turnstile error ' + (code || '')); } catch (_) { /* noop */ }
        return true;
      },
    });
  }

  if (window.turnstile) {
    renderTurnstile();
  } else {
    var polls = 0;
    var poll = setInterval(function () {
      polls++;
      if (window.turnstile) { clearInterval(poll); renderTurnstile(); }
      if (polls > 50) clearInterval(poll);
    }, 100);
  }

  function turnstileToken() {
    if (!window.turnstile || turnstileWidgetId === null) return '';
    return window.turnstile.getResponse(turnstileWidgetId) || '';
  }

  // A token is single-use: after any lookup, the old one is spent and the next attempt
  // would fail the captcha for reasons the user cannot see.
  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
  }

  /* ── Step 1: who are you ───────────────────────────────────── */

  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var email = String(emailInput.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.focus();
      return;
    }

    emailSubmit.disabled = true;
    var label = emailSubmit.querySelector('span');
    var restore = label ? label.getAttribute('data-i18n') : null;
    if (label) setText(label, 'scorerExamChecking');

    fetch(DIRECTUS_URL + '/kscw/scorer-exam/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, turnstile_token: turnstileToken() }),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 404) { showError('scorerExamNotRegistered'); return; }
        if (r.status === 429) { showError('scorerExamRateLimited'); return; }
        if (r.status === 400 && r.body.error === 'captcha_failed') { showError('scorerExamCaptchaFailed'); return; }
        if (r.status !== 200 || !r.body.data || !r.body.data.length) { showError('scorerExamNetworkError'); return; }
        matches = r.body.data;
        enterUploadStep();
      })
      .catch(function () { showError('scorerExamNetworkError'); })
      .finally(function () {
        emailSubmit.disabled = false;
        if (label && restore) setText(label, restore);
        resetTurnstile();
      });
  });

  function enterUploadStep() {
    var first = matches[0].first_name || '';
    greeting.textContent = first ? t('scorerExamHello') + ' ' + first + ' 👋' : '';
    greeting.hidden = !first;

    // One course is the normal case; only ask which when the answer isn't obvious.
    if (matches.length > 1) {
      courseSelect.textContent = '';
      matches.forEach(function (m, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = t('scorerExamCourseOf') + ' ' + fmtDate(m.course_date);
        courseSelect.appendChild(opt);
      });
      courseGroup.hidden = false;
    } else {
      courseGroup.hidden = true;
    }
    courseSelect.onchange = renderForCourse;
    renderForCourse();

    stepEmail.hidden = true;
    stepFile.hidden = false;
    stepDone.hidden = true;
    // Focus whichever field still needs an answer.
    if (licenceInput.value) fileInput.focus(); else licenceInput.focus();
  }

  function current() {
    var idx = matches.length > 1 ? Number(courseSelect.value || 0) : 0;
    return matches[idx] || matches[0];
  }

  // Everything that depends on WHICH signup is selected. Called on entry and whenever the
  // course picker changes, so switching course cannot leave the other course's licence
  // or "already uploaded" notice on screen.
  function renderForCourse() {
    var m = current();
    if (m && m.uploaded_on) {
      already.textContent = t('scorerExamAlreadyUploaded', { date: fmtDate(m.uploaded_on) });
      already.hidden = false;
    } else {
      already.hidden = true;
    }
    // Pre-fill rather than lock: the number we hold may be a typo, and the participant is
    // the one who can see the real one.
    licenceInput.value = (m && m.licence) || '';
    if (licenceHelp) {
      setText(licenceHelp, (m && m.licence) ? 'scorerExamLicenceKnown' : 'scorerExamLicenceHelp');
    }
  }

  /* ── Step 2: the bytes ─────────────────────────────────────── */

  // Same normalization the server applies (normalizeLicence in scorer-exam.js): keep the
  // digits, drop whatever separators people type.
  function normalizeLicence(v) {
    var digits = String(v == null ? '' : v).replace(/\D/g, '');
    return (digits.length >= 4 && digits.length <= 10) ? digits : '';
  }

  fileForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var licence = normalizeLicence(licenceInput.value);
    if (!licence) {
      showError(String(licenceInput.value).trim() ? 'scorerExamLicenceInvalid' : 'scorerExamLicenceMissing');
      licenceInput.focus();
      return;
    }

    var file = fileInput.files && fileInput.files[0];
    if (!file) { showError('scorerExamNoFile'); return; }
    // The server enforces this too (and sniffs the real type); this only saves the user
    // from watching 40 MB upload before being told no.
    if (file.size > MAX_BYTES) { showError('scorerExamTooLarge'); return; }

    var m = current();
    if (!m || !m.ticket) { showError('scorerExamExpired'); return; }

    fileSubmit.disabled = true;
    var label = fileSubmit.querySelector('span');
    var restore = label ? label.getAttribute('data-i18n') : null;
    if (label) setText(label, 'scorerExamUploading');

    var url = DIRECTUS_URL + '/kscw/scorer-exam/upload'
      + '?ticket=' + encodeURIComponent(m.ticket)
      + '&licence=' + encodeURIComponent(licence)
      + '&filename=' + encodeURIComponent(file.name || '');

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 200) {
          m.uploaded_on = (r.body.data && r.body.data.uploaded_on) || null;
          m.licence = licence; // so "upload another" pre-fills what was just accepted
          stepFile.hidden = true;
          stepDone.hidden = false;
          fileInput.value = '';
          return;
        }
        if (r.status === 413) { showError('scorerExamTooLarge'); return; }
        if (r.status === 415) { showError('scorerExamBadType'); return; }
        if (r.status === 403) { showError('scorerExamExpired'); return; }
        if (r.status === 429) { showError('scorerExamRateLimited'); return; }
        if (r.status === 422) {
          showError(r.body.error === 'licence_invalid' ? 'scorerExamLicenceInvalid' : 'scorerExamLicenceMissing');
          return;
        }
        showError('scorerExamNetworkError');
      })
      .catch(function () { showError('scorerExamNetworkError'); })
      .finally(function () {
        fileSubmit.disabled = false;
        if (label && restore) setText(label, restore);
      });
  });

  againBtn.addEventListener('click', function () {
    clearError();
    stepDone.hidden = true;
    stepFile.hidden = false;
    renderForCourse();
    fileInput.focus();
  });
})();
