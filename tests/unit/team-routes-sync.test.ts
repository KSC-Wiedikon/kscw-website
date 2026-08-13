import { describe, it, expect } from 'vitest';
import { allTeamDefs } from '../../src/data/teams';
import { volleyballTeams, basketballTeams } from '../../src/data/team-routes';

/**
 * `teams.ts` and `team-routes.ts` are two hand-maintained tables describing the same
 * teams, kept in step by nothing at all.
 *
 * They serve different callers — `teams.ts` drives cards, chips and the nav, while
 * `team-routes.ts` is what `[slug].astro` hands to `getStaticPaths()` — so a team
 * present in one and missing from the other fails in a way that is easy to miss: the
 * page is either built with no card linking to it, or linked from a card that 404s.
 * Adding DU20 and the two Classics teams meant touching both, which is exactly the
 * moment this drift gets introduced.
 */
describe('teams.ts and team-routes.ts agree', () => {
  const routes = [...volleyballTeams, ...basketballTeams];
  const detailDefs = allTeamDefs.filter((d) => d.hasDetailPage);

  it('every team with a detail page has a build route', () => {
    const missing = detailDefs
      .filter((d) => !routes.some((r) => r.sport === d.sport && r.slug === d.slug))
      .map((d) => `${d.sport}/${d.slug}`);

    expect(missing, 'defs marked hasDetailPage with no entry in team-routes.ts').toEqual([]);
  });

  it('every build route has a team def behind it', () => {
    const orphans = routes
      .filter((r) => !detailDefs.some((d) => d.sport === r.sport && d.slug === r.slug))
      .map((r) => `${r.sport}/${r.slug}`);

    expect(orphans, 'routes in team-routes.ts with no hasDetailPage def').toEqual([]);
  });

  it('the two tables agree on each team\'s Directus id', () => {
    // The id is the fallback used when Directus is unreachable at build time, so a
    // mismatch surfaces only on a bad build day — the worst time to discover it.
    const conflicts: string[] = [];
    for (const r of routes) {
      const def = detailDefs.find((d) => d.sport === r.sport && d.slug === r.slug);
      if (def && def.directusId !== r.directusId) {
        conflicts.push(`${r.sport}/${r.slug}: routes=${r.directusId} defs=${def.directusId}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('slugs are unique within a sport', () => {
    for (const sport of ['volleyball', 'basketball'] as const) {
      const slugs = allTeamDefs.filter((d) => d.sport === sport).map((d) => d.slug);
      expect(new Set(slugs).size, `duplicate slug in ${sport}`).toBe(slugs.length);
    }
  });
});
