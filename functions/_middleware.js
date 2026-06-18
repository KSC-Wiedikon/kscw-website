// Cloudflare Pages Functions middleware — runs on every request to this
// project, on BOTH the *.pages.dev default domain and the kscw.ch custom
// domain (they serve the same static deploy in parallel).
//
// Purpose: transitional redirect of the bare project domain
// `kscw-website.pages.dev` → `kscw.ch`, so links that were sent out pointing
// at pages.dev land on the real site after the kscw.ch cutover.
//
// Why 302 (temporary) and not 301: this is a time-bound measure (must stay at
// least until 2026-07-08). A 301 is cached by browsers/proxies indefinitely
// and is hard to unwind; a 302 keeps it cleanly reversible. If pages.dev →
// kscw.ch is later made permanent, switch the status below to 301.
//
// Scope: only the exact `kscw-website.pages.dev` host is redirected. Preview
// deploys (`<hash>.kscw-website.pages.dev`) and kscw.ch itself pass through
// untouched. astro dev does not run Pages Functions, so local dev is unaffected.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === 'kscw-website.pages.dev') {
    url.hostname = 'kscw.ch';
    return Response.redirect(url.toString(), 302);
  }
  return next();
}
