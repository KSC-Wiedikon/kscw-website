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

    return fetch('/js/i18n/' + lang + '.json?v=4')
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
    var value = strings[key];
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

    // data-i18n-html → innerHTML
    // Safe: values come exclusively from our own bundled JSON translation
    // files which are static assets under our control, not user input.
    var htmlNodes = root.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmlNodes.length; j++) {
      var htmlKey = htmlNodes[j].getAttribute('data-i18n-html');
      if (htmlKey) htmlNodes[j].innerHTML = t(htmlKey);
    }

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
    });
  }

  /* ── Initialize ───────────────────────────────────────────── */

  function init() {
    var lang = detectLang();
    return loadTranslations(lang).then(function () {
      // German is the server-rendered default — no DOM pass needed. English
      // gets swapped in place. Either way, clear the loading veil.
      if (lang !== 'de') applyTranslations();
      document.body.classList.remove('i18n-loading');
      updateLangButtons(lang);
      readyResolve(lang);
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
