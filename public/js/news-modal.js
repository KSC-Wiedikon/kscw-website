/**
 * News Detail Modal — opens when clicking a news card on the homepage.
 * Reads article data from embedded <script type="application/json"> inside each card.
 */
(function () {
  'use strict';

  var overlay = null;
  var historyPushed = false; // did we add a history entry for the open modal?
  var basePath = '';         // URL to restore to when the modal closes

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function createCloseSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'currentColor');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');
    path.setAttribute('d', 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z');
    svg.appendChild(path);
    return svg;
  }

  // DOM-only teardown — never touches history. Idempotent.
  function teardown() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = '';
    }
    overlay = null;
  }

  // User-initiated close (X / overlay / Esc). Keeps the URL in sync so a shared
  // ?article= link doesn't immediately re-open the modal after it's dismissed.
  function close() {
    if (historyPushed) {
      historyPushed = false;
      window.history.back(); // fires popstate → teardown()
    } else {
      teardown();
      if (basePath) window.history.replaceState({}, '', basePath);
    }
  }

  // Browser back/forward closes the modal visually without re-popping history.
  window.addEventListener('popstate', function () {
    historyPushed = false;
    teardown();
  });

  function showNewsModal(data, locale, opts) {
    if (overlay) teardown();
    var isDE = locale !== 'en';
    var deepLink = !!(opts && opts.deepLink);

    document.body.style.overflow = 'hidden';
    overlay = el('div', 'news-modal-overlay');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    var modal = el('div', 'news-modal');
    overlay.appendChild(modal);

    // ── Header: badge + close
    var header = el('div', 'nm-header');
    var left = el('div', 'nm-header-left');

    var dateStr = data.date
      ? new Date(data.date).toLocaleDateString(isDE ? 'de-CH' : 'en-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: 'long', year: 'numeric' })
      : '';
    if (dateStr) left.appendChild(el('span', 'news-date', dateStr));

    var badgeClass = 'badge';
    var badgeLabel = 'Club';
    if (data.category === 'volleyball') { badgeClass += ' badge-blue'; badgeLabel = 'Volleyball'; }
    else if (data.category === 'basketball') { badgeClass += ' badge-orange'; badgeLabel = 'Basketball'; }
    left.appendChild(el('span', badgeClass, badgeLabel));

    if (data.author) left.appendChild(el('span', 'nm-author', data.author));

    header.appendChild(left);

    var closeBtn = el('button', 'gm-close');
    closeBtn.appendChild(createCloseSvg());
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // ── Title
    modal.appendChild(el('h2', 'nm-title', data.title));

    // ── Image
    if (data.image) {
      var imgWrap = el('div', 'nm-image');
      var img = document.createElement('img');
      img.src = data.image;
      img.alt = data.title;
      imgWrap.appendChild(img);
      modal.appendChild(imgWrap);
    }

    // ── Body (HTML from `news.body`)
    // SECURITY: Sanitize with DOMPurify before insertion. Admin panel already
    // DOMPurifies on save, but Directus Studio / REST writes bypass that, so the
    // public renderer sanitizes again as the enforcing boundary.
    // LINKS: <a> tags are allowed. DOMPurify's default URI filter already blocks
    // javascript:/vbscript:/data: hrefs; the post-pass below additionally keeps
    // only http(s)/mailto hrefs and opens external links in a new tab safely.
    if (data.body) {
      var body = el('div', 'nm-body');
      var raw = String(data.body);
      var clean;
      if (typeof window.DOMPurify !== 'undefined') {
        clean = window.DOMPurify.sanitize(raw, {
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta', 'base'],
          FORBID_ATTR: ['style', 'formaction', 'action', 'xlink:href'],
          KEEP_CONTENT: true,
        });
      } else {
        // Fallback if the CDN fails to load: render escaped plain text rather
        // than risk an under-sanitized innerHTML assignment.
        clean = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      body.innerHTML = clean; // eslint-disable-line no-unsanitized/property -- DOMPurify-sanitized above
      // Keep only http(s)/mailto hrefs; open external links in a new tab safely.
      var anchors = body.querySelectorAll('a');
      for (var ai = 0; ai < anchors.length; ai++) {
        var a = anchors[ai];
        var href = a.getAttribute('href') || '';
        if (/^https?:/i.test(href)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        } else if (!/^mailto:/i.test(href)) {
          a.removeAttribute('href');
        }
      }
      modal.appendChild(body);
    }

    // ── Share buttons
    var shareBar = el('div', 'nm-share');
    var shareLabel = el('span', 'nm-share-label', isDE ? 'Teilen' : 'Share');
    shareBar.appendChild(shareLabel);

    var shareBase = window.location.origin + '/news/';
    var pageUrl = data.slug ? shareBase + '?article=' + encodeURIComponent(data.slug) : shareBase;
    var shareText = data.title + ' — KSC Wiedikon';

    // Reflect the article in the address bar so the page URL is itself shareable
    // and refresh/back behave sensibly — but only on the news listing page, so a
    // card opened from e.g. the homepage doesn't rewrite that page's URL.
    var onNewsPage = window.location.pathname.indexOf('/news') !== -1;
    if (data.slug && onNewsPage) {
      basePath = shareBase;
      if (deepLink) {
        window.history.replaceState({ kscwNews: 1 }, '', pageUrl);
        historyPushed = false;
      } else {
        window.history.pushState({ kscwNews: 1 }, '', pageUrl);
        historyPushed = true;
      }
    } else {
      basePath = '';
      historyPushed = false;
    }

    // WhatsApp
    var waBtn = el('a', 'nm-share-btn nm-share-whatsapp');
    waBtn.href = 'https://wa.me/?text=' + encodeURIComponent(shareText + '\n' + pageUrl);
    waBtn.target = '_blank';
    waBtn.rel = 'noopener';
    waBtn.title = 'WhatsApp';
    waBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    shareBar.appendChild(waBtn);

    // Facebook
    var fbBtn = el('a', 'nm-share-btn nm-share-facebook');
    fbBtn.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl);
    fbBtn.target = '_blank';
    fbBtn.rel = 'noopener';
    fbBtn.title = 'Facebook';
    fbBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
    shareBar.appendChild(fbBtn);

    // X (Twitter)
    var xBtn = el('a', 'nm-share-btn nm-share-x');
    xBtn.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(pageUrl);
    xBtn.target = '_blank';
    xBtn.rel = 'noopener';
    xBtn.title = 'X';
    xBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
    shareBar.appendChild(xBtn);

    // Email
    var emBtn = el('a', 'nm-share-btn nm-share-email');
    emBtn.href = 'mailto:?subject=' + encodeURIComponent(shareText) + '&body=' + encodeURIComponent(pageUrl);
    emBtn.title = 'Email';
    emBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';
    shareBar.appendChild(emBtn);

    // Copy link
    var copyBtn = el('button', 'nm-share-btn nm-share-copy');
    copyBtn.title = isDE ? 'Link kopieren' : 'Copy link';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(pageUrl).then(function () {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(function () {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        }, 2000);
      });
    });
    shareBar.appendChild(copyBtn);

    modal.appendChild(shareBar);

    document.body.appendChild(overlay);

    // Escape key
    function onKey(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    }
    document.addEventListener('keydown', onKey);
  }

  // ── Click handler for news cards
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.news-card[data-news-id]');
    if (!card) return;
    var dataEl = card.querySelector('.news-data');
    if (!dataEl) return;
    try {
      var data = JSON.parse(dataEl.textContent);
      var locale = document.documentElement.lang || 'de';
      showNewsModal(data, locale);
    } catch (err) {
      console.warn('[KSCW] Failed to parse news data:', err);
    }
  });

  // ── Deep link: /xx/news/?article=<slug> opens that article directly ────────
  // Works even for older/paginated articles not in the initial list render, by
  // fetching the single article from Directus by slug. Static site, runtime data.
  function directusBase() {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1')
      ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  }

  function openArticleBySlug(slug) {
    var locale = document.documentElement.lang || 'de';
    var isEN = locale === 'en';
    var base = directusBase();
    var fields = 'id,title,title_en,slug,excerpt,body,category,author,published_at,image,date_created';
    var url = base + '/items/news?fields=' + encodeURIComponent(fields)
      + '&filter=' + encodeURIComponent(JSON.stringify({ slug: { _eq: slug } }))
      + '&limit=1';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var n = res && res.data && res.data[0];
        if (!n) return; // unknown or unpublished slug → leave the listing as-is
        showNewsModal({
          title: (isEN && n.title_en) ? n.title_en : n.title,
          body: n.body,
          date: n.published_at || n.date_created,
          category: n.category,
          image: n.image ? (base + '/assets/' + n.image + '?width=800&quality=80') : '',
          author: n.author,
          slug: n.slug
        }, locale, { deepLink: true });
      })
      .catch(function () {});
  }

  (function bootstrapDeepLink() {
    var slug;
    try { slug = new URLSearchParams(window.location.search).get('article'); }
    catch (e) { slug = null; }
    if (slug) openArticleBySlug(slug);
  })();
})();
