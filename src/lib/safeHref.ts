/**
 * Scheme allowlist for any `href` built from data we did not author.
 *
 * Sponsor `website_url` is admin-authored in Directus and lands directly in
 * `a.href` on the sponsors page, the homepage and every team page. The site's
 * CSP carries `script-src 'unsafe-inline'` — SECURITY.md records that deferral
 * as acceptable *because the stored-XSS sinks are closed* — so a `javascript:`
 * URL reaching an href is not a theoretical finding. It executes on click.
 *
 * This module has an ES5 twin at `public/js/safe-href.js` for the two browser
 * contexts that cannot import a module. The two must behave identically;
 * `tests/unit/safe-href.test.ts` runs one corpus through both to enforce it.
 */

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** `scheme:` at the start of a URL, per RFC 3986. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

/** Numeric HTML character reference, with or without the closing semicolon. */
const NUMERIC_ENTITY_RE = /&#(x[0-9a-f]+|[0-9]+);?/gi;

/**
 * Expand numeric HTML entities so a scheme cannot hide behind one.
 *
 * `jav&#x09;ascript:` is what the HTML parser hands to the URL parser, so a
 * check that ran on the raw string would wave through something the browser
 * then executes. Semicolon-less forms are consumed greedily here because that
 * is how the HTML parser consumes them — which is also why `&#x09a` decodes to
 * U+009A rather than to TAB, and is consequently inert.
 *
 * Used only to decide accept/reject; the caller returns the ORIGINAL string, so
 * a legitimate `&#38;` in a query string is never rewritten.
 */
function expandNumericEntities(value: string): string {
  return value.replace(NUMERIC_ENTITY_RE, (match, digits: string) => {
    const cp = digits[0].toLowerCase() === 'x'
      ? parseInt(digits.slice(1), 16)
      : parseInt(digits, 10);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
    return String.fromCodePoint(cp);
  });
}

/**
 * Reduce a URL to what the WHATWG URL parser would actually act on.
 *
 * Deliberately narrow, and it matters in both directions:
 * - NUL, TAB, LF and CR are removed *anywhere*, so `jav<TAB>ascript:` cannot
 *   smuggle a scheme past the check.
 * - Everything else is left alone. C1 controls in particular are NOT stripped
 *   — the parser percent-encodes them — so `jav<U+009A>script:` keeps an
 *   illegal character in its scheme position, fails to parse as a scheme, and
 *   is treated as a relative path. Stripping C1 here would turn that inert
 *   string into `javscript:` and then into a false rejection.
 */
function normalizeForInspection(value: string): string {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 0x00 || cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
    out += ch;
  }
  // The parser also strips leading and trailing C0 controls and spaces.
  let start = 0;
  let end = out.length;
  while (start < end && (out.codePointAt(start) as number) <= 0x20) start++;
  while (end > start && (out.codePointAt(end - 1) as number) <= 0x20) end--;
  return out.slice(start, end);
}

/**
 * Vet a URL destined for an `href`.
 *
 * @param raw candidate URL, typically straight from Directus
 * @returns the ORIGINAL string when safe, or `''` when not — so a caller can
 *   write `safeHref(x) || fallback` and never emit a dangerous href. Returning
 *   the original rather than the normalised form means a legitimate URL passes
 *   through byte-for-byte as the admin entered it.
 */
export function safeHref(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  const cleaned = normalizeForInspection(expandNumericEntities(raw));
  if (cleaned === '') return '';

  // Protocol-relative ("//evil.example") looks like a path but inherits the
  // page scheme and navigates off-site — the open-redirect / phishing vector.
  // A sponsor linking outward must write the scheme explicitly.
  if (cleaned.startsWith('//')) return '';

  const scheme = cleaned.match(SCHEME_RE);

  // No parseable scheme ⇒ a relative URL ("/weiteres/datenschutz",
  // "sponsoren", "#kontakt", "?tab=news"). These resolve against our own
  // origin and cannot dispatch a scheme, so they are safe by construction.
  if (!scheme) return raw;

  return SAFE_SCHEMES.includes(scheme[1].toLowerCase() + ':') ? raw : '';
}
