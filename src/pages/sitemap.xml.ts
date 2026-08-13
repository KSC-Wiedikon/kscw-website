/**
 * sitemap.xml
 *
 * Written as an endpoint rather than pulled in via `@astrojs/sitemap` on purpose:
 * the integration would need a dependency (and a package-lock change) to produce
 * something this site can derive from sources it already globs for
 * `site-text-manifest.json.ts`, and doing it here keeps the exclusion rules
 * readable — `/admin` and the 404 must never be listed.
 *
 * URLs carry a trailing slash to match `rel="canonical"` in BaseLayout: the
 * directory build format serves every page at a trailing slash and the host 308s the
 * slashless form onto it, so listing the slashless URL would point crawlers at a
 * redirect.
 */
import type { APIRoute } from 'astro';
import { volleyballTeams, basketballTeams } from '../data/team-routes';
import { getActiveTeams } from '../lib/fetch/teams';

const SITE = 'https://kscw.ch';

/** Page sources, same glob the site-text manifest uses. */
const PAGE_SOURCES = import.meta.glob('./**/*.astro', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/**
 * Never listed:
 *  - admin.astro — a hidden tool, already `noindex` and Disallowed in robots.txt.
 *  - 404.astro — Astro emits it as dist/404.html; it is an error document, not a page.
 *  - [slug].astro — a template, not a URL. Its real routes are added below.
 */
const EXCLUDED = /(?:^\.\/admin\.astro$|^\.\/404\.astro$|\[[^\]]+\])/;

function staticRoutes(): string[] {
  return Object.keys(PAGE_SOURCES)
    .filter((p) => !EXCLUDED.test(p))
    .map((p) => p.replace(/^\./, '').replace(/\.astro$/, '').replace(/\/index$/, ''))
    .map((r) => (r === '' ? '/' : r));
}

async function teamRoutes(): Promise<string[]> {
  // Prefer the live team list so the sitemap follows the season rollover; fall back
  // to the static route tables when Directus is unreachable at build time, exactly
  // as the detail pages themselves do.
  try {
    const live = await getActiveTeams();
    const routes = live
      .filter((tm) => tm.hasDetailPage)
      .map((tm) => `/${tm.sport === 'basketball' ? 'basketball' : 'volleyball'}/${tm.slug}`);
    if (routes.length) return routes;
  } catch { /* fall through to the static tables */ }

  return [
    ...volleyballTeams.map((tm) => `/volleyball/${tm.slug}`),
    ...basketballTeams.map((tm) => `/basketball/${tm.slug}`),
  ];
}

export const GET: APIRoute = async () => {
  const paths = [...new Set([...staticRoutes(), ...await teamRoutes()])].sort();

  const urls = paths
    .map((path) => {
      const loc = `${SITE}${path === '/' ? '/' : `${path}/`}`;
      // The homepage is the entry point; team and news pages change with the season.
      const priority = path === '/' ? '1.0' : path.split('/').length > 2 ? '0.6' : '0.8';
      return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};
