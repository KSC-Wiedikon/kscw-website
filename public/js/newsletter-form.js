/**
 * KSCW Newsletter Subscribe Form
 * Handles subscribe, verify (double opt-in), and unsubscribe via URL params.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';

  var form = document.getElementById('newsletter-form');
  if (!form) return;

  var emailInput = document.getElementById('nl-email');
  var feedback = document.getElementById('nl-feedback');
  var submitBtn = form.querySelector('.form-submit');
  var turnstileContainer = document.getElementById('nl-turnstile');
  var turnstileWidgetId = null;

  function renderTurnstile() {
    if (!turnstileContainer || !window.turnstile) return;
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
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
        try { console.error('[newsletter] turnstile error ' + (code || '')); } catch (_) { /* noop */ }
        return true;
      },
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

  function getCategories() {
    var checks = form.querySelectorAll('input[name="nl-category"]:checked');
    var cats = [];
    for (var i = 0; i < checks.length; i++) cats.push(checks[i].value);
    return cats;
  }

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
    submitBtn.textContent = loading ? (i18n.t('contactSending') || '...') : i18n.t('newsletterSubscribe');
  }

  // Handle ?verify= and ?unsubscribe= URL params
  var params = new URLSearchParams(window.location.search);
  var verifyToken = params.get('verify');
  var unsubToken = params.get('unsubscribe');

  if (verifyToken) {
    fetch(DIRECTUS_URL + '/kscw/newsletter/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verifyToken }),
    })
      .then(function (r) { return r.json(); })
      .then(function () { showFeedback('success', i18n.t('newsletterVerified')); })
      .catch(function () { showFeedback('error', i18n.t('newsletterError')); });
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (unsubToken) {
    fetch(DIRECTUS_URL + '/kscw/newsletter/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: unsubToken }),
    })
      .then(function (r) { return r.json(); })
      .then(function () { showFeedback('success', i18n.t('newsletterUnsubscribed')); })
      .catch(function () { showFeedback('error', i18n.t('newsletterError')); });
    window.history.replaceState({}, '', window.location.pathname);
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideFeedback();

    var email = (emailInput.value || '').trim();
    if (!email) return showFeedback('error', i18n.t('contactValidationEmail'));

    var categories = getCategories();
    if (!categories.length) return showFeedback('error', i18n.t('newsletterError'));

    var turnstileToken = '';
    if (window.turnstile && turnstileWidgetId !== null) {
      turnstileToken = window.turnstile.getResponse(turnstileWidgetId) || '';
    }
    if (!turnstileToken) return showFeedback('error', i18n.t('contactValidationCaptcha'));

    var locale = document.documentElement.lang || 'de';

    setLoading(true);

    fetch(DIRECTUS_URL + '/kscw/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        locale: locale,
        categories: categories,
        turnstile_token: turnstileToken,
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || i18n.t('newsletterError'));
          return d;
        });
      })
      .then(function (data) {
        if (data.already_subscribed) {
          showFeedback('info', i18n.t('newsletterAlreadySubscribed'));
        } else {
          showFeedback('success', i18n.t('newsletterSuccess'));
          form.reset();
          form.querySelectorAll('input[name="nl-category"]').forEach(function (cb) { cb.checked = true; });
        }
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      })
      .catch(function (err) {
        showFeedback('error', err.message || i18n.t('newsletterError'));
      })
      .finally(function () {
        setLoading(false);
      });
  });
})();
