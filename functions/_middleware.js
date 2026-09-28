// Cloudflare Pages Functions middleware — the legacy /de/… and /en/… 301s.
//
// The single-URL migration dropped the locale prefixes (one URL per page,
// language toggled client-side). These redirects used to be splat rules in
// `public/_redirects` (`/de/*  /:splat  301`), which is an open redirect:
// `/de//evil.example` makes the splat `/evil.example` and the Location
// `//evil.example` — protocol-relative, i.e. another host. `_redirects` has no
// way to normalise a splat, so the rule lives here, where it can.
//
// Scope: `public/_routes.json` routes ONLY /de, /de/*, /en and /en/* through
// Functions; every other request is served straight from the static deploy
// with no invocation. Because Cloudflare does not apply `_redirects` to a
// request a Function serves, every /de and /en rule — the translated-slug and
// retired-page ones too — must live in this file, not in `_redirects`.
//
// History: until 2026-09-28 this file 302'd the bare `kscw-website.pages.dev`
// host to kscw.ch (a transitional measure for the 2026-06-18 cutover, required
// until 2026-07-08). That window has closed, and kscw.ch is now served by the
// `kscw-web` project, which never answers on that host — so it was removed.
//
// astro dev / astro preview do not run Pages Functions; locally these URLs 404.
// Pinned by tests/unit/edge-ci.test.ts.

/** Exact legacy paths whose canonical slug is not simply "drop the prefix". */
export const LEGACY_EXACT = {
  // English pages that had a translated slug map to the German canonical slug.
  '/en/volleyball/regulations': '/volleyball/reglemente',
  '/en/volleyball/scheduling': '/volleyball/spielplanung',
  '/en/basketball/scheduling': '/basketball/spielplanung',
  // Retired mixed-tournament pages (previously redirected to the sport overview).
  '/de/volleyball/mixed-turnier': '/volleyball',
  '/en/volleyball/mixed-tournament': '/volleyball',
  '/en/volleyball/mixed-turnier': '/volleyball',
};

/**
 * The canonical same-origin path for a legacy /de or /en pathname, or null if
 * `pathname` is not a legacy URL. The result ALWAYS starts with exactly one `/`
 * followed by something other than `/` or `\` — so it can never be read as a
 * protocol-relative (`//host`) or backslash (`/\host`) reference to another host,
 * whatever the request carried (raw or percent-encoded).
 */
export function legacyRedirectPath(pathname) {
  if (typeof pathname !== 'string') return null;
  const m = /^\/(de|en)(\/.*)?$/.exec(pathname);
  if (!m) return null;

  const exact = LEGACY_EXACT[pathname.replace(/\/+$/, '')];
  if (exact) return exact;

  let rest = m[2] || '/';
  // Decode percent-encoded slashes/backslashes FIRST — a browser resolving the
  // Location would not decode them, but an intermediate proxy might, and there
  // is no legitimate slug containing either.
  rest = rest.replace(/%2f/gi, '/').replace(/%5c/gi, '\\');
  // Any run of `/` and `\` becomes a single `/`, everywhere, so the path cannot
  // begin with `//` or `/\` and no segment is empty.
  rest = rest.replace(/[/\\]+/g, '/');
  return rest.startsWith('/') ? rest : '/' + rest;
}

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const path = legacyRedirectPath(url.pathname);
  if (path === null) return next();
  // Build an ABSOLUTE same-origin URL by concatenation, never `new URL(path, …)`:
  // the resolver is exactly what would turn `//evil.example` into another host.
  return Response.redirect(url.origin + path + url.search, 301);
}
