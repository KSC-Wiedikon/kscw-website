/* ================================================================
   KSC Wiedikon — Site search (client-side, bilingual)
   Loads a small page index + both language dictionaries, so a query
   in German OR English finds the right page. Results are shown in the
   active language. No dependencies.
   ================================================================ */
(function () {
  'use strict';

  var overlay = document.getElementById('site-search');
  if (!overlay) return;

  var input = overlay.querySelector('[data-search-input]');
  var resultsEl = overlay.querySelector('[data-search-results]');
  var openBtns = document.querySelectorAll('[data-search-open]');
  var closeBtn = overlay.querySelector('[data-search-close]');

  var index = null;      // [{ url, titleKey, descKey, section }]
  var dicts = null;      // { de: {...}, en: {...} }
  var loading = false;
  var activeIdx = -1;    // keyboard-highlighted result

  function lang() {
    return (window.i18n && window.i18n.getLang && window.i18n.getLang()) ||
      document.documentElement.lang || 'de';
  }
  function tr(key) {
    if (!key) return '';
    var d = dicts || {};
    var l = lang();
    return (d[l] && d[l][key]) || (d.de && d.de[key]) || key;
  }

  // Lazily fetch the index + both dictionaries on first open.
  function ensureData() {
    if (index || loading) return Promise.resolve();
    loading = true;
    return Promise.all([
      fetch('/search-index.json').then(function (r) { return r.json(); }),
      fetch('/js/i18n/de.json').then(function (r) { return r.json(); }),
      fetch('/js/i18n/en.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      index = res[0];
      dicts = { de: res[1], en: res[2] };
      // Precompute a lowercase bilingual haystack per entry.
      for (var i = 0; i < index.length; i++) {
        var e = index[i];
        var parts = [
          dicts.de[e.titleKey], dicts.en[e.titleKey],
          dicts.de[e.descKey], dicts.en[e.descKey]
        ];
        e._hay = parts.filter(Boolean).join('  ').toLowerCase();
      }
      loading = false;
    }).catch(function () { loading = false; });
  }

  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!index) return [];
    if (!q) return index.slice();
    // AND across whitespace-separated terms, matched on the bilingual haystack.
    var terms = q.split(/\s+/);
    return index.filter(function (e) {
      for (var i = 0; i < terms.length; i++) {
        if (e._hay.indexOf(terms[i]) === -1) return false;
      }
      return true;
    });
  }

  function render(list) {
    activeIdx = -1;
    resultsEl.textContent = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = tr('searchNoResults');
      resultsEl.appendChild(empty);
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var a = document.createElement('a');
      a.className = 'search-result';
      a.href = e.url;
      a.setAttribute('role', 'option');
      var title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = tr(e.titleKey).replace(/\s+—\s+KSC Wiedikon$/, '');
      a.appendChild(title);
      if (e.section) {
        var sec = document.createElement('span');
        sec.className = 'search-result-section';
        sec.textContent = tr(e.section);
        a.appendChild(sec);
      }
      frag.appendChild(a);
    }
    resultsEl.appendChild(frag);
  }

  function update() { render(search(input.value)); }

  function open() {
    ensureData().then(function () {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      input.value = '';
      render(search(''));
      setTimeout(function () { input.focus(); }, 30);
    });
  }
  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Keyboard navigation within the results list.
  function moveActive(delta) {
    var items = resultsEl.querySelectorAll('.search-result');
    if (!items.length) return;
    activeIdx = (activeIdx + delta + items.length) % items.length;
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', i === activeIdx);
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  openBtns.forEach(function (b) { b.addEventListener('click', open); });
  if (closeBtn) closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      var items = resultsEl.querySelectorAll('.search-result');
      if (activeIdx >= 0 && items[activeIdx]) { window.location.href = items[activeIdx].href; }
      else if (items.length === 1) { window.location.href = items[0].href; }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    // Cmd/Ctrl+K opens search from anywhere.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
  });

  // Keep results in the active language when the toggle switches mid-search.
  document.addEventListener('langChanged', function () {
    if (overlay.classList.contains('open')) update();
  });
})();
