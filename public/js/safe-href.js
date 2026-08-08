/* ================================================================
   KSC Wiedikon — href scheme allowlist (browser twin of src/lib/safeHref.ts)
   Plain vanilla ES5, no dependencies. Exposes window.kscwSafeHref.

   Sponsor `website_url` is admin-authored in Directus and assigned straight to
   `a.href` on the homepage and on every team page. The site's CSP carries
   `script-src 'unsafe-inline'` — SECURITY.md records that deferral as
   acceptable *because the stored-XSS sinks are closed* — so a `javascript:`
   URL reaching an href executes on click.

   This is the runtime half of a deliberate pair; the build-time half is
   src/lib/safeHref.ts, used by the statically-rendered sponsors page. Same
   duplication pattern the repo already uses for src/lib/i18n.ts <->
   public/js/i18n.js. The two MUST behave identically —
   tests/unit/safe-href.test.ts runs one corpus through both to enforce it.
   ================================================================ */

(function () {
  'use strict';

  var SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
  var SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
  var NUMERIC_ENTITY_RE = /&#(x[0-9a-f]+|[0-9]+);?/gi;

  /**
   * Expand numeric HTML entities so a scheme cannot hide behind one.
   * `jav&#x09;ascript:` is what the HTML parser hands the URL parser, so a
   * check on the raw string would wave through something the browser executes.
   * Greedy without a semicolon, matching the HTML parser — which is why
   * `&#x09a` decodes to U+009A rather than TAB, and is inert.
   * Decision-only: the caller returns the ORIGINAL string.
   */
  function expandNumericEntities(value) {
    return value.replace(NUMERIC_ENTITY_RE, function (match, digits) {
      var cp = digits.charAt(0).toLowerCase() === 'x'
        ? parseInt(digits.slice(1), 16)
        : parseInt(digits, 10);
      if (!isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
      return String.fromCodePoint(cp);
    });
  }

  /**
   * Reduce a URL to what the WHATWG URL parser would actually act on.
   * NUL/TAB/LF/CR are removed anywhere so a scheme cannot be smuggled past the
   * check; everything else is left alone. C1 controls in particular are NOT
   * stripped — the parser percent-encodes them — so `jav<U+009A>script:` keeps
   * an illegal character in scheme position and is treated as a relative path.
   */
  function normalizeForInspection(value) {
    var out = '';
    for (var i = 0; i < value.length; i++) {
      var cp = value.charCodeAt(i);
      if (cp === 0x00 || cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
      out += value.charAt(i);
    }
    var start = 0;
    var end = out.length;
    while (start < end && out.charCodeAt(start) <= 0x20) start++;
    while (end > start && out.charCodeAt(end - 1) <= 0x20) end--;
    return out.slice(start, end);
  }

  /**
   * @param {unknown} raw candidate URL, typically straight from Directus
   * @returns {string} the ORIGINAL string when safe, else '' so the caller can
   *   write `kscwSafeHref(x) || fallback` and never emit a dangerous href.
   */
  function safeHref(raw) {
    if (typeof raw !== 'string') return '';

    var cleaned = normalizeForInspection(expandNumericEntities(raw));
    if (cleaned === '') return '';

    // Protocol-relative ("//evil.example") looks like a path but inherits the
    // page scheme and navigates off-site — the open-redirect vector.
    if (cleaned.slice(0, 2) === '//') return '';

    var scheme = cleaned.match(SCHEME_RE);

    // No parseable scheme ⇒ relative URL; resolves against our own origin,
    // cannot dispatch a scheme, safe by construction.
    if (!scheme) return raw;

    return SAFE_SCHEMES.indexOf(scheme[1].toLowerCase() + ':') !== -1 ? raw : '';
  }

  window.kscwSafeHref = safeHref;
})();
