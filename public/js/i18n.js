/* ================================================================
   KSC Wiedikon — Internationalization (i18n) Module
   Plain vanilla JS, no dependencies.
   Detects language, loads JSON translations, applies to DOM.
   ================================================================ */

(function () {
  'use strict';

  var cache = {};
  var currentLang = 'de';
  var readyResolve;

  // Page-text overrides saved in /admin → Seitentexte. The dictionaries remain the
  // source of truth; this is a thin layer on top, so a key with no override — the
  // overwhelming majority — behaves exactly as before, and a key whose override is
  // deleted returns to the repo's own wording with no code change.
  //
  // Fetched here as well as baked into the build (scripts/fetch-site-text.mjs)
  // because the two solve different halves: the build makes the German HTML and
  // the crawler's view correct, this makes an edit visible without waiting for a
  // rebuild. It is deliberately never awaited — see loadOverrides().
  var overrides = { de: {}, en: {} };

  window.i18nReady = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  /* ── Language Detection ───────────────────────────────────── */

  var STORAGE_KEY = 'kscw-locale';

  function detectLang() {
    // Single-URL site: language lives in localStorage (set by the header
    // toggle), not in the URL path. An explicit prior choice always wins;
    // otherwise default to the browser language — German or English — and fall
    // back to German when the browser is neither.
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'de') return stored;
    } catch (e) { /* private mode */ }
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.indexOf('en') === 0) return 'en';
    if (nav.indexOf('de') === 0) return 'de';
    return 'de';
  }

  /* ── Load Translations ────────────────────────────────────── */

  function loadTranslations(lang) {
    if (cache[lang]) {
      currentLang = lang;
      document.documentElement.lang = lang;
      return Promise.resolve(cache[lang]);
    }

    // Content hash injected by BaseLayout (window.__I18N_V). Falls back to an
    // UNVERSIONED url rather than a stale literal: revalidating is a cheap
    // miss, serving four-hour-old translations is a visible bug.
    var v = (window.__I18N_V && window.__I18N_V[lang]) || '';
    return fetch('/js/i18n/' + lang + '.json' + (v ? '?v=' + v : ''))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load translations for ' + lang);
        return res.json();
      })
      .then(function (data) {
        cache[lang] = data;
        currentLang = lang;
        document.documentElement.lang = lang;
        return data;
      });
  }

  /* ── Translation Lookup ───────────────────────────────────── */

  function t(key, params) {
    var strings = cache[currentLang] || {};
    // Overrides win over the shipped dictionary. Reading them here rather than in
    // applyTranslations() means every consumer of window.i18n.t() — the news list,
    // the calendar, team pages — picks up an edit too, including content rendered
    // long after the overrides arrived.
    var over = overrides[currentLang] || {};
    var value = Object.prototype.hasOwnProperty.call(over, key) ? over[key] : strings[key];
    if (value === undefined) return key;

    if (params) {
      Object.keys(params).forEach(function (k) {
        value = value.split('{' + k + '}').join(params[k]);
      });
    }

    return value;
  }

  /* ── Apply Translations to DOM ────────────────────────────── */

  function applyTranslations(container) {
    var root = container || document;

    // data-i18n → textContent
    var textNodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < textNodes.length; i++) {
      var key = textNodes[i].getAttribute('data-i18n');
      if (key) textNodes[i].textContent = t(key);
    }

    // NOTE: there is deliberately no data-i18n-html / innerHTML path here.
    // Translated values are applied as text only. The premise that dictionary
    // values are "static assets under our control" stops holding the moment any
    // of them becomes admin-editable, and an innerHTML sink would then be a
    // stored-XSS hole that is invisible to a German-speaking reviewer (German
    // renders at build time through Astro's auto-escaping; only the client-side
    // English swap would execute it). Markup that needs a link inside a sentence
    // is split into sibling data-i18n nodes — see the privacy-consent block in
    // src/pages/club/kontakt.astro and src/pages/club/feedback.astro.

    // data-i18n-placeholder → placeholder attribute
    var phNodes = root.querySelectorAll('[data-i18n-placeholder]');
    for (var p = 0; p < phNodes.length; p++) {
      var phKey = phNodes[p].getAttribute('data-i18n-placeholder');
      if (phKey) phNodes[p].setAttribute('placeholder', t(phKey));
    }

    // data-i18n-title → title attribute
    var titleNodes = root.querySelectorAll('[data-i18n-title]');
    for (var ti = 0; ti < titleNodes.length; ti++) {
      var titleKey = titleNodes[ti].getAttribute('data-i18n-title');
      if (titleKey) titleNodes[ti].setAttribute('title', t(titleKey));
    }

    // data-i18n-aria-label → aria-label attribute
    var ariaNodes = root.querySelectorAll('[data-i18n-aria-label]');
    for (var a = 0; a < ariaNodes.length; a++) {
      var ariaKey = ariaNodes[a].getAttribute('data-i18n-aria-label');
      if (ariaKey) ariaNodes[a].setAttribute('aria-label', t(ariaKey));
    }

    // data-i18n-alt → alt attribute
    var altNodes = root.querySelectorAll('[data-i18n-alt]');
    for (var al = 0; al < altNodes.length; al++) {
      var altKey = altNodes[al].getAttribute('data-i18n-alt');
      if (altKey) altNodes[al].setAttribute('alt', t(altKey));
    }

    // <meta name="i18n-title"> → document.title
    var metaTitle = document.querySelector('meta[name="i18n-title"]');
    if (metaTitle) {
      var metaKey = metaTitle.getAttribute('content');
      if (metaKey) document.title = t(metaKey);
    }

    // <meta name="i18n-description"> → <meta name="description"> content
    var metaDesc = document.querySelector('meta[name="i18n-description"]');
    if (metaDesc) {
      var descKey = metaDesc.getAttribute('content');
      var descTarget = document.querySelector('meta[name="description"]');
      if (descKey && descTarget) descTarget.setAttribute('content', t(descKey));
    }
  }

  /* ── Admin Text Overrides ─────────────────────────────────── */

  // Keys are generated by our own code and validated on write, but they are
  // interpolated into a CSS selector below, so re-check the shape here: a stray
  // quote in a key would otherwise widen the selector to elements it never named.
  var KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

  var ATTR_TARGETS = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-alt', 'alt']
  ];

  function directusBase() {
    // Same host-based split as team-page.js / scoreboard.js: no build-time config
    // reaches this file, and a Pages preview deliberately reads production text.
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1')
      ? 'https://directus-dev.kscw.ch'
      : 'https://directus.kscw.ch';
  }

  // The same rule the build applies (scripts/fetch-site-text.mjs): a non-empty
  // string carrying no markup. Values reach the DOM through textContent and
  // setAttribute, so a "<" could not execute here in any case — refusing it keeps
  // "a translated value is never markup" true on both paths instead of just one.
  function usableOverride(value) {
    return typeof value === 'string' && value.trim() !== '' && value.indexOf('<') === -1;
  }

  /**
   * Re-render only the keys that carry an override.
   *
   * German is server-rendered and normally gets no DOM pass at all (see init()),
   * so without this an admin's German edit would not appear until the next
   * rebuild. Touching just the overridden keys keeps that property for the other
   * ~990: this is a handful of querySelectorAll calls, not a second full pass.
   */
  function applyOverrides() {
    var map = overrides[currentLang] || {};

    Object.keys(map).forEach(function (key) {
      if (!KEY_RE.test(key)) return;
      var value = t(key);

      var nodes = document.querySelectorAll('[data-i18n="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = value;

      for (var a = 0; a < ATTR_TARGETS.length; a++) {
        var attr = ATTR_TARGETS[a][0];
        var target = ATTR_TARGETS[a][1];
        var attrNodes = document.querySelectorAll('[' + attr + '="' + key + '"]');
        for (var n = 0; n < attrNodes.length; n++) attrNodes[n].setAttribute(target, value);
      }
    });

    // <title> and the description meta carry their key in an attribute, so they
    // need the same treatment as the two applyTranslations() blocks that own them.
    var metaTitle = document.querySelector('meta[name="i18n-title"]');
    var titleKey = metaTitle && metaTitle.getAttribute('content');
    if (titleKey && Object.prototype.hasOwnProperty.call(map, titleKey)) {
      document.title = t(titleKey);
    }
    var metaDesc = document.querySelector('meta[name="i18n-description"]');
    var descKey = metaDesc && metaDesc.getAttribute('content');
    if (descKey && Object.prototype.hasOwnProperty.call(map, descKey)) {
      var descTarget = document.querySelector('meta[name="description"]');
      if (descTarget) descTarget.setAttribute('content', t(descKey));
    }
  }

  /**
   * Fetch the overrides into memory. Applying them is a separate step, called once
   * the active language is settled — otherwise a fast Directus could beat the
   * same-origin dictionary and briefly paint German values over an English page.
   *
   * Never rejects outward, and init() never awaits it: the page is already
   * complete and correct from the build output before this runs. Directus being
   * slow, blocked or down must cost nothing beyond the site showing its committed
   * wording — the same outcome as no overrides existing at all.
   */
  function fetchOverrides() {
    return fetch(directusBase() + '/kscw/site-text', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var next = { de: {}, en: {} };
        ['de', 'en'].forEach(function (lang) {
          var incoming = (data && data[lang]) || {};
          Object.keys(incoming).forEach(function (key) {
            if (KEY_RE.test(key) && usableOverride(incoming[key])) next[lang][key] = incoming[key];
          });
        });
        overrides = next;
      })
      .catch(function (err) {
        // Not console.error: on a site with no overrides saved this is the normal
        // state before the Directus extension ships, and it breaks nothing.
        if (window.console && console.debug) {
          console.debug('[i18n] no text overrides applied:', err.message);
        }
      });
  }

  /* ── Update Language Switcher Buttons ─────────────────────── */

  function updateLangButtons(lang) {
    var buttons = document.querySelectorAll('.lang-btn, .lang-btn-mobile');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var btnLang = btn.getAttribute('data-lang') || btn.getAttribute('data-lang-choice');
      var isActive = btnLang === lang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  /* ── Set Language ─────────────────────────────────────────── */

  function setLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode */ }
    return loadTranslations(lang).then(function () {
      applyTranslations();
      updateLangButtons(lang);
      document.body.classList.remove('i18n-loading');
      document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang: lang } }));
    }).catch(function (err) {
      // Same reasoning as init(): never leave the veil up. The toggle simply
      // does nothing visible and the page stays in the language it already had.
      if (window.console && console.error) {
        console.error('[i18n] failed to switch to "' + lang + '":', err);
      }
      document.body.classList.remove('i18n-loading');
      updateLangButtons(currentLang);
    });
  }

  /* ── Initialize ───────────────────────────────────────────── */

  function init() {
    var lang = detectLang();
    // Started here so it runs alongside the dictionary rather than after it, but
    // applied only once the language is settled. It resolves either way, so
    // neither the veil nor window.i18nReady can ever wait on Directus.
    var pendingOverrides = fetchOverrides();

    return loadTranslations(lang).then(function () {
      // German is the server-rendered default — no DOM pass needed. English
      // gets swapped in place. Either way, clear the loading veil.
      if (lang !== 'de') applyTranslations();
      document.body.classList.remove('i18n-loading');
      updateLangButtons(lang);
      readyResolve(lang);
      pendingOverrides.then(applyOverrides);
    }).catch(function (err) {
      // A failed dictionary fetch must never leave the page veiled or
      // window.i18nReady unsettled. Several subsystems await that promise
      // (team pages, calendar, scorer courses, youth status) and would hang
      // forever on a pending promise, rendering a blank page rather than a
      // degraded one. German is already server-rendered so falling through
      // costs nothing; English silently stays German, which beats blank.
      if (window.console && console.error) {
        console.error('[i18n] failed to load "' + lang + '" dictionary:', err);
      }
      document.body.classList.remove('i18n-loading');
      updateLangButtons(currentLang);
      readyResolve(currentLang);
      // The dictionary failed, but the German build output on screen is intact and
      // its overrides are independent of that fetch — still worth applying.
      pendingOverrides.then(applyOverrides);
    });
  }

  // Auto-initialize as soon as the script runs / DOM is ready, so language is
  // applied without every page wiring it up manually.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ───────────────────────────────────────────── */

  window.i18n = {
    t: t,
    setLang: setLang,
    getLang: function () { return currentLang; },
    applyTranslations: applyTranslations,
    init: init
  };

})();
