/**
 * /search-index.json — what the header search box downloads on first open.
 *
 * This used to be a static `public/search-index.json` of 23 hand-written entries, and
 * it listed **no team page at all**. Searching "d1", "lions", "rhinos" or "hu20" —
 * the club's own team names, and the pages most search traffic lands on — returned
 * nothing. Teams also turn over every June, so a hand-maintained list was guaranteed
 * to rot in exactly the way `src/data/teams.ts` just did.
 *
 * So the curated part (static pages, which change rarely) stays hand-written in
 * `src/data/search-pages.json`, and the team entries are generated here from the same
 * live source the nav and the detail pages use.
 *
 * ⚠ Team entries carry a LITERAL `title`, not a `titleKey`. A team's name is data, not
 * a dictionary key — see the note in public/js/search.js, which had to learn to read
 * literal titles before any of this could match anything.
 */
import type { APIRoute } from 'astro';
import curated from '../data/search-pages.json';
import { getActiveTeams } from '../lib/fetch/teams';
import { volleyballTeams, basketballTeams } from '../data/team-routes';
import { getBadgeText } from '../data/teams';

interface SearchEntry {
  url: string;
  titleKey?: string;
  descKey?: string;
  /** Literal display title, for entries whose name is data rather than a key. */
  title?: string;
  /** Literal description text, folded into the search haystack. */
  desc?: string;
  /** Extra searchable terms the page copy never actually says. */
  keywords?: string;
  section: string;
}

async function teamEntries(): Promise<SearchEntry[]> {
  try {
    const live = await getActiveTeams();
    const withPages = live.filter((tm) => tm.hasDetailPage);
    if (withPages.length) {
      return withPages.map((tm) => {
        const sport = tm.sport === 'basketball' ? 'basketball' : 'volleyball';
        const league = getBadgeText(tm.league, tm.chipLabel);
        return {
          url: `/${sport}/${tm.slug}`,
          title: tm.displayName,
          // Both the raw short name and the readable league, so "d1", "2. Liga",
          // "lions" and "damen" all reach the same page.
          desc: [tm.chipLabel, league, tm.displayName].filter(Boolean).join(' '),
          keywords: `${sport} team mannschaft training trainingszeiten probetraining`,
          section: sport === 'basketball' ? 'navBasketball' : 'navVolleyball',
        };
      });
    }
  } catch { /* fall through to the static route tables */ }

  // Directus unreachable at build time — fall back to the route tables, exactly as
  // the detail pages and the sitemap do. Less rich, but never empty.
  return [
    ...volleyballTeams.map((tm) => ({
      url: `/volleyball/${tm.slug}`, title: tm.short,
      keywords: 'volleyball team mannschaft training', section: 'navVolleyball',
    })),
    ...basketballTeams.map((tm) => ({
      url: `/basketball/${tm.slug}`, title: tm.short,
      keywords: 'basketball team mannschaft training', section: 'navBasketball',
    })),
  ];
}

export const GET: APIRoute = async () => {
  const teams = await teamEntries();
  const seen = new Set(curated.map((e) => e.url));
  const entries = [...(curated as SearchEntry[]), ...teams.filter((e) => !seen.has(e.url))];

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
