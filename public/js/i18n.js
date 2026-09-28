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
  // True only once /kscw/site-text has answered. "No overrides" and "could not
  // ask" must not look the same — see applyOverrides().
  var overridesLoaded = false;

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

  /**
   * The dictionary response, reusing the request the pre-paint script in
   * BaseLayout.astro already put in flight.
   *
   * That script is inline, so it runs before this file has even been downloaded.
   * Asking for the dictionary here instead would mean two sequential round trips
   * — download i18n.js, then request the dictionary — and the second one is what
   * the visitor is waiting on to stop reading German.
   *
   * One-shot: consumed on first use so a later setLang() (the toggle, switching
   * to the OTHER language) always issues a fresh request. Falls back to fetch()
   * whenever there is no hand-off — a page not using BaseLayout, a browser where
   * the inline script threw, or a language other than the one it detected.
   */
  function dictionaryRequest(lang, url) {
    var pre = window.__I18N_PRE;
    if (pre && pre.lang === lang && pre.p) {
      window.__I18N_PRE = null;
      return pre.p;
    }
    return fetch(url);
  }

  /**
   * Get a dictionary into the cache. Does NOT switch the active language — that
   * is activate()'s job, and it is kept separate so a response that arrives late
   * can be dropped (see langSeq).
   */
  function fetchDictionary(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);

    // Content hash injected by BaseLayout (window.__I18N_V). Falls back to an
    // UNVERSIONED url rather than a stale literal: revalidating is a cheap
    // miss, serving four-hour-old translations is a visible bug.
    var v = (window.__I18N_V && window.__I18N_V[lang]) || '';
    return dictionaryRequest(lang, '/js/i18n/' + lang + '.json' + (v ? '?v=' + v : ''))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load translations for ' + lang);
        return res.json();
      })
      .then(function (data) {
        cache[lang] = data;
        return data;
      });
  }

  function activate(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
  }

  // Bumped by every language request (the initial load and each toggle). A
  // response is applied only if no newer request was made while it was in
  // flight. Without it, a fast double click EN→DE could finish with DE (cached,
  // instant) first and EN (network) last, leaving the page English while the
  // visitor had just chosen German (audit 2026-09-28, F-49).
  var langSeq = 0;


  /* ── Translation Lookup ───────────────────────────────────── */

  // `{count}`-style placeholders. Same helper as scripts/fetch-site-text.mjs.
  function placeholderSet(value) {
    var found = String(value).match(/\{[a-zA-Z0-9_]+\}/g) || [];
    var set = {};
    for (var i = 0; i < found.length; i++) set[found[i]] = true;
    return set;
  }

  function samePlaceholders(a, b) {
    var pa = placeholderSet(a);
    var pb = placeholderSet(b);
    var ka = Object.keys(pa);
    if (ka.length !== Object.keys(pb).length) return false;
    for (var i = 0; i < ka.length; i++) if (!pb[ka[i]]) return false;
    return true;
  }

  /**
   * The override for `key`, if it passes the rule the build applies
   * (scripts/fetch-site-text.mjs → sanitize): the key must exist in the shipped
   * dictionary, and the override must carry the same `{placeholder}` set as the
   * default. The runtime layer used to skip both, so an override that dropped
   * `{team}` rendered a sentence with the team name missing — on the live page,
   * seconds after the save, while the build quietly refused the same row (audit
   * 2026-09-28, F-47). Checked at lookup time because only then is the
   * dictionary it is compared against guaranteed to be loaded.
   */
  function validOverride(lang, key, fallback) {
    var over = overrides[lang] || {};
    if (!Object.prototype.hasOwnProperty.call(over, key)) return undefined;
    if (fallback === undefined) return undefined;
    return samePlaceholders(over[key], fallback) ? over[key] : undefined;
  }

  function t(key, params) {
    var strings = cache[currentLang] || {};
    // Overrides win over the shipped dictionary. Reading them here rather than in
    // applyTranslations() means every consumer of window.i18n.t() — the news list,
    // the calendar, team pages — picks up an edit too, including content rendered
    // long after the overrides arrived.
    var shipped = strings[key];
    var over = validOverride(currentLang, key, shipped);
    var value = over !== undefined ? over : shipped;
    if (value === undefined) {
      // No dictionary at all (both the requested language and the German
      // fallback failed to load): an empty string, never the raw key name, which
      // is what a visitor used to read in every script-built label (F-48).
      return cache[currentLang] ? key : '';
    }

    if (params) {
      Object.keys(params).forEach(function (k) {
        value = value.split('{' + k + '}').join(params[k]);
      });
    }

    return value;
  }

  /* ── Apply Translations to DOM ────────────────────────────── */

  /**
   * Write a translated value into an `href`, or into nothing at all.
   *
   * Every other target here (textContent, alt, title, …) is inert whatever the
   * value says. An href is not: dictionary values are admin-editable through
   * Seitentexte, and `script-src` still carries 'unsafe-inline', so a
   * `javascript:` value would execute on click — the sponsor `website_url` hole
   * SECURITY.md records, arriving by a second route. Same guard, same posture:
   * fail closed, so a rejected value leaves an element with no href rather than
   * an unvetted one. A missing kscwSafeHref (it loads render-blocking from
   * BaseLayout's <head>) is treated as a rejection, not as permission.
   */
  function applyHref(node, value) {
    var vetted = typeof window.kscwSafeHref === 'function' ? window.kscwSafeHref(value) : '';
    if (vetted) node.setAttribute('href', vetted);
    else node.removeAttribute('href');
  }

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

    // data-i18n-href → href attribute (vetted; see applyHref)
    var hrefNodes = root.querySelectorAll('[data-i18n-href]');
    for (var h = 0; h < hrefNodes.length; h++) {
      var hrefKey = hrefNodes[h].getAttribute('data-i18n-href');
      if (hrefKey) applyHref(hrefNodes[h], t(hrefKey));
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

  // Third element: the value is a URL and must go through applyHref() rather than
  // setAttribute(). An override is exactly the case that guard exists for.
  var ATTR_TARGETS = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-alt', 'alt'],
    ['data-i18n-href', 'href', true]
  ];

  function directusBase() {
    // The backend BaseLayout injected (window.__KSCW_DIRECTUS, audit 2026-09-28,
    // F-41): the same Directus the build baked its site-text overrides from
    // (scripts/fetch-site-text.mjs reads DIRECTUS_URL too), so a preview reads
    // the text it was built with. The host split is only a fallback.
    if (window.__KSCW_DIRECTUS) return window.__KSCW_DIRECTUS;
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
    // No dictionary means nothing to validate an override against, and t()
    // answers '' — writing that would blank the server-rendered German text.
    // Leave the DOM as the build shipped it.
    if (!cache[currentLang]) return;
    var map = overrides[currentLang] || {};

    // Keys the BUILD baked an override into the German HTML (BaseLayout →
    // window.__I18N_BAKED). If that override has since been deleted, the
    // server-rendered node still shows it and — German getting no DOM pass —
    // nothing would put the shipped wording back until the next rebuild (audit
    // 2026-09-28, F-46). Re-render those keys too; t() now returns the
    // dictionary value for them. Only once the override fetch has SUCCEEDED: an
    // unreachable Directus must not revert a live override to the old text.
    var keys = Object.keys(map);
    var baked = currentLang === 'de' && overridesLoaded && window.__I18N_BAKED;
    if (baked && baked.length) {
      for (var b = 0; b < baked.length; b++) {
        if (!Object.prototype.hasOwnProperty.call(map, baked[b])) keys.push(baked[b]);
      }
    }

    keys.forEach(function (key) {
      if (!KEY_RE.test(key)) return;
      var value = t(key);

      var nodes = document.querySelectorAll('[data-i18n="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = value;

      for (var a = 0; a < ATTR_TARGETS.length; a++) {
        var attr = ATTR_TARGETS[a][0];
        var target = ATTR_TARGETS[a][1];
        var isUrl = ATTR_TARGETS[a][2];
        var attrNodes = document.querySelectorAll('[' + attr + '="' + key + '"]');
        for (var n = 0; n < attrNodes.length; n++) {
          if (isUrl) applyHref(attrNodes[n], value);
          else attrNodes[n].setAttribute(target, value);
        }
      }
    });

    // <title> and the description meta carry their key in an attribute, so they
    // need the same treatment as the two applyTranslations() blocks that own them.
    var metaTitle = document.querySelector('meta[name="i18n-title"]');
    var titleKey = metaTitle && metaTitle.getAttribute('content');
    if (titleKey && keys.indexOf(titleKey) !== -1) {
      document.title = t(titleKey);
    }
    var metaDesc = document.querySelector('meta[name="i18n-description"]');
    var descKey = metaDesc && metaDesc.getAttribute('content');
    if (descKey && keys.indexOf(descKey) !== -1) {
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
        overridesLoaded = true;
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
    var seq = ++langSeq;
    return fetchDictionary(lang).then(function () {
      // A newer toggle was made while this dictionary was loading — it owns the
      // page now (F-49).
      if (seq !== langSeq) return;
      activate(lang);
      applyTranslations();
      updateLangButtons(lang);
      document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang: lang } }));
    }).catch(function (err) {
      // The toggle simply does nothing visible and the page stays in the language
      // it already had.
      if (window.console && console.error) {
        console.error('[i18n] failed to switch to "' + lang + '":', err);
      }
      // activate() sets <html lang> only on success, so nothing to undo here —
      // but the buttons were already showing the requested language.
      if (seq === langSeq) updateLangButtons(currentLang);
    });
  }

  /* ── Initialize ───────────────────────────────────────────── */

  /**
   * ⚠ The dictionary request is issued the moment this file executes — in <head>,
   * before the parser has reached <body>. Do not move it back behind a DOM event.
   *
   * It used to be started from a DOMContentLoaded handler, which put the ONE
   * request that can turn the page English behind the entire document, including a
   * 398 KB parser-blocking icon bundle. First paint then always won a race against
   * a request that had not been made yet, and an English visitor read a complete,
   * finished German page for a measured ~466 ms at 150 ms RTT (~674 ms at 6× CPU)
   * before it flipped. On localhost the dictionary happened to land ~1 ms before
   * first paint, which is why this never showed up in development.
   *
   * Nothing about STARTING the fetch needs the DOM, so nothing here waits for it.
   * Applying the result does need the DOM, and that is what the two passes below
   * are for.
   */
  var activeLang = detectLang();

  // Resolves to the language actually in effect — the requested one, or 'de' when
  // its dictionary could not be fetched. Deliberately never rejects: several
  // subsystems await window.i18nReady (team pages, calendar, scorer courses, youth
  // status) and would hang forever on a pending promise, rendering a blank page
  // rather than a degraded one.
  var initSeq = ++langSeq;
  var pendingDictionary = fetchDictionary(activeLang)
    .then(function () {
      // A toggle made while the first dictionary was in flight wins (F-49).
      if (initSeq === langSeq) activate(activeLang);
      return currentLang;
    })
    .catch(function (err) {
      if (window.console && console.error) {
        console.error('[i18n] failed to load "' + activeLang + '" dictionary:', err);
      }
      // The pre-paint script in BaseLayout has already set <html lang> to the
      // requested language. Put it back to what we can actually render: the
      // [data-lang-only] rules in global.css key off html[lang], so leaving it at
      // "en" would show the English half of every dual-rendered block sitting on
      // top of otherwise-German text. German is server-rendered, so falling back
      // costs nothing.
      document.documentElement.lang = currentLang;
      // …but German still needs its DICTIONARY for everything a script builds
      // (t() is how the team pages, calendar and forms label their nodes). It used
      // to stay unloaded, and every such label read as its raw key name (audit
      // 2026-09-28, F-48). Never rejects: if German fails too, t() returns ''.
      if (activeLang === 'de') return currentLang;
      return fetchDictionary('de')
        .then(function () { if (initSeq === langSeq) activate('de'); return currentLang; })
        .catch(function () { return currentLang; });
    });

  // Started alongside the dictionary rather than after it, and never awaited by
  // anything the page needs. Directus being slow, blocked or down must cost
  // nothing beyond the site showing its committed wording.
  var pendingOverrides = fetchOverrides();

  /**
   * Translate the DOM as it currently stands.
   *
   * Runs twice on a first load: once the instant the dictionary resolves — which
   * may be mid-parse, and is the pass that keeps the visitor's first paint in their
   * own language — and once at DOMContentLoaded for whatever the parser produced in
   * between. applyTranslations() is idempotent and costs ~130 textContent writes,
   * so the second pass is sub-millisecond.
   *
   * `settle` is true only on the final pass: that is the one allowed to resolve
   * window.i18nReady, whose contract is "dictionary loaded AND document
   * translated". Resolving it mid-parse would hand consumers a DOM whose render
   * targets do not exist yet.
   */
  function applyPass(lang, settle) {
    // German is the server-rendered default and needs no DOM pass.
    if (lang !== 'de') applyTranslations();
    updateLangButtons(lang);
    if (!settle) return;
    readyResolve(lang);
    pendingOverrides.then(applyOverrides);
    // Nodes built by page scripts DURING body parse (the homepage game tables)
    // carry a data-i18n key but were filled from a still-empty dictionary. This is
    // the signal that lets their page repair them. It is deliberately not
    // `langChanged`: that event has thirteen listeners wired for an explicit
    // toggle, several of which re-fetch from Directus, and firing them all on every
    // page load would make loading slower, not faster.
    document.dispatchEvent(new CustomEvent('i18nApplied', { detail: { lang: lang } }));
  }

  pendingDictionary.then(function (lang) {
    if (document.readyState === 'loading') {
      applyPass(lang, false);
      document.addEventListener('DOMContentLoaded', function () { applyPass(lang, true); });
    } else {
      applyPass(lang, true);
    }
  });

  /* ── Public API ───────────────────────────────────────────── */

  window.i18n = {
    t: t,
    setLang: setLang,
    getLang: function () { return currentLang; },
    applyTranslations: applyTranslations,
    // Re-run the final pass. Nothing in the repo calls this — the engine wires
    // itself up above — but it stays on the API so a page that injects a large
    // subtree can settle it without knowing about the two-pass bootstrap.
    init: function () {
      return pendingDictionary.then(function (lang) { applyPass(lang, true); });
    }
  };

})();
