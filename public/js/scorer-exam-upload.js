/**
 * Scorer-exam scoresheet upload (/weiteres/schreiberkurse/pruefung).
 *
 * Two entry points, one page:
 *   1. No ticket in the URL → ask for the email. /lookup MAILS the registered address a
 *      link to this page and answers { ok: true } whatever the address was, so this page
 *      only ever says "if it's registered, check your inbox" (2026-09-28 audit: the
 *      ticket used to come back to the browser, so knowing someone's email was enough to
 *      upload as them, and a 404 told you whether they were registered).
 *   2. Opened from that link (#ticket=… in the fragment) → strip the ticket from the
 *      address bar, ask /ticket what to show, then upload.
 * The ticket is minted and verified server-side (scorer-exam.js); this file never decides
 * who anyone is, it only carries the ticket back.
 *
 * ⚠ The upload puts ticket + filename in the QUERY STRING, not in request headers.
 * Directus answers preflight with `access-control-allow-headers: Content-Type,
 * Authorization, X-Turnstile-Token`, so a custom header is blocked by the browser
 * before the request leaves — and curl, which skips preflight, would not reveal it.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = window.__KSCW_DIRECTUS || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch');
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';
  var MAX_BYTES = 10 * 1024 * 1024; // keep in sync with UPLOAD_MAX_BYTES in scorer-exam.js

  var emailForm = document.getElementById('exam-email-form');
  if (!emailForm) return;

  var stepEmail = document.getElementById('exam-step-email');
  var stepSent = document.getElementById('exam-step-sent');
  var stepLoading = document.getElementById('exam-step-loading');
  var stepFile = document.getElementById('exam-step-file');
  var stepDone = document.getElementById('exam-step-done');
  var emailInput = document.getElementById('exam-email');
  var emailSubmit = document.getElementById('exam-email-submit');
  var fileForm = document.getElementById('exam-file-form');
  var fileInput = document.getElementById('exam-file');
  var fileSubmit = document.getElementById('exam-file-submit');
  var licenceInput = document.getElementById('exam-licence');
  var licenceGroup = document.getElementById('exam-licence-group');
  var licenceOnFile = document.getElementById('exam-licence-on-file');
  var greeting = document.getElementById('exam-greeting');
  var courseLine = document.getElementById('exam-course-line');
  var otherAddressBtn = document.getElementById('exam-other-address');
  var already = document.getElementById('exam-already');
  var feedback = document.getElementById('exam-feedback');
  var againBtn = document.getElementById('exam-again');
  var turnstileHost = document.getElementById('exam-turnstile');

  // The one signup this page is uploading for, set only from an emailed link.
  var ticket = '';
  var info = null;
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

  /* ── Step 1: send me a link ────────────────────────────────── */

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
    if (label) setText(label, 'scorerExamSending');

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
        if (r.status === 429) { showError('scorerExamRateLimited'); return; }
        if (r.status === 400 && r.body.error === 'captcha_failed') { showError('scorerExamCaptchaFailed'); return; }
        if (r.status !== 200 || !r.body.ok) { showError('scorerExamNetworkError'); return; }
        // Deliberately the same message for every address: the server does not tell us
        // whether it matched, and the page must not pretend to know.
        show(stepSent);
      })
      .catch(function () { showError('scorerExamNetworkError'); })
      .finally(function () {
        emailSubmit.disabled = false;
        if (label && restore) setText(label, restore);
        resetTurnstile();
      });
  });

  otherAddressBtn.addEventListener('click', function () {
    clearError();
    show(stepEmail);
    emailInput.focus();
  });

  function show(step) {
    [stepEmail, stepSent, stepLoading, stepFile, stepDone].forEach(function (el) {
      if (el) el.hidden = el !== step;
    });
  }

  /* ── Opened from the emailed link ──────────────────────────── */

  /** The ticket from the fragment (what the mail links to) or, defensively, the query. */
  function ticketFromUrl() {
    var hash = String(window.location.hash || '').replace(/^#/, '');
    var fromHash = new URLSearchParams(hash).get('ticket');
    if (fromHash) return fromHash;
    return new URLSearchParams(window.location.search).get('ticket') || '';
  }

  // Take the ticket out of the address bar straight away, so it does not end up in a
  // bookmark, a screenshot, a shared link or the browser's synced history entry.
  function stripTicketFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      params.delete('ticket');
      var qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    } catch (_) { /* old browser: the ticket just stays visible */ }
  }

  function openTicket(tk) {
    show(stepLoading);
    fetch(DIRECTUS_URL + '/kscw/scorer-exam/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: tk }),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.body.data) {
          ticket = tk;
          info = r.body.data;
          enterUploadStep();
          return;
        }
        show(stepEmail);
        if (r.status === 403) { showError('scorerExamLinkInvalid'); return; }
        if (r.status === 429) { showError('scorerExamRateLimited'); return; }
        showError('scorerExamNetworkError');
      })
      .catch(function () {
        show(stepEmail);
        showError('scorerExamNetworkError');
      });
  }

  function enterUploadStep() {
    var first = info.first_name || '';
    greeting.textContent = first ? t('scorerExamHello') + ' ' + first + ' 👋' : '';
    greeting.hidden = !first;
    if (info.course_date) {
      courseLine.textContent = t('scorerExamCourseOf') + ' ' + fmtDate(info.course_date);
      courseLine.hidden = false;
    } else {
      courseLine.hidden = true;
    }
    renderStatus();
    show(stepFile);
    if (info.graded) return; // nothing to fill in — the notice says why
    if (info.licence_on_file) fileInput.focus(); else licenceInput.focus();
  }

  // The number itself never reaches the browser (2026-09-28 audit) — only whether we
  // have one. With one on file the field is not asked at all: the server keeps the
  // recorded number and would ignore a typed one anyway.
  function renderStatus() {
    // Graded (2026-09-28 audit, F-14): /upload answers 409 already_graded, so say it
    // up-front (when /ticket reports `graded`) instead of after a 10 MB transfer.
    if (info && info.graded) {
      setText(already, 'scorerExamAlreadyGraded');
      already.hidden = false;
    } else if (info && info.uploaded_on) {
      already.textContent = t('scorerExamAlreadyUploaded', { date: fmtDate(info.uploaded_on) });
      already.removeAttribute('data-i18n'); // interpolated — re-rendered here, not by the toggle
      already.hidden = false;
    } else {
      already.hidden = true;
    }
    fileSubmit.disabled = !!(info && info.graded);
    var onFile = !!(info && info.licence_on_file);
    licenceGroup.hidden = onFile;
    licenceInput.required = !onFile;
    licenceOnFile.hidden = !onFile;
  }

  var initialTicket = ticketFromUrl();
  if (initialTicket) {
    stripTicketFromUrl();
    openTicket(initialTicket);
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

    if (!ticket || !info) { show(stepEmail); showError('scorerExamLinkInvalid'); return; }
    if (info.graded) { showError('scorerExamAlreadyGraded'); return; }

    // With a licence on file the field is hidden and nothing is sent: the server keeps
    // the recorded number.
    var licence = '';
    if (!info.licence_on_file) {
      licence = normalizeLicence(licenceInput.value);
      if (!licence) {
        showError(String(licenceInput.value).trim() ? 'scorerExamLicenceInvalid' : 'scorerExamLicenceMissing');
        licenceInput.focus();
        return;
      }
    }

    var file = fileInput.files && fileInput.files[0];
    if (!file) { showError('scorerExamNoFile'); return; }
    // The server enforces this too (and sniffs the real type); this only saves the user
    // from watching 40 MB upload before being told no.
    if (file.size > MAX_BYTES) { showError('scorerExamTooLarge'); return; }

    fileSubmit.disabled = true;
    var label = fileSubmit.querySelector('span');
    var restore = label ? label.getAttribute('data-i18n') : null;
    if (label) setText(label, 'scorerExamUploading');

    var url = DIRECTUS_URL + '/kscw/scorer-exam/upload'
      + '?ticket=' + encodeURIComponent(ticket)
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
          info.uploaded_on = (r.body.data && r.body.data.uploaded_on) || null;
          // The server stored the typed number, so "upload another" need not ask again.
          if (licence) info.licence_on_file = true;
          show(stepDone);
          fileInput.value = '';
          return;
        }
        if (r.status === 413) { showError('scorerExamTooLarge'); return; }
        if (r.status === 415) { showError('scorerExamBadType'); return; }
        if (r.status === 409 && r.body.error === 'already_graded') {
          // Graded after the link was opened: nothing more this page can do.
          info.graded = true;
          renderStatus();
          showError('scorerExamAlreadyGraded');
          return;
        }
        if (r.status === 403) {
          // Expired (24h) or the course was closed: the only way on is a fresh link.
          ticket = '';
          info = null;
          show(stepEmail);
          showError('scorerExamLinkInvalid');
          return;
        }
        if (r.status === 429) { showError('scorerExamRateLimited'); return; }
        if (r.status === 422) {
          showError(r.body.error === 'licence_invalid' ? 'scorerExamLicenceInvalid' : 'scorerExamLicenceMissing');
          return;
        }
        showError('scorerExamNetworkError');
      })
      .catch(function () { showError('scorerExamNetworkError'); })
      .finally(function () {
        fileSubmit.disabled = !!(info && info.graded);
        if (label && restore) setText(label, restore);
      });
  });

  againBtn.addEventListener('click', function () {
    clearError();
    renderStatus();
    show(stepFile);
    fileInput.focus();
  });
})();
