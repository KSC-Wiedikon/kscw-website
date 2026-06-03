import { fetchAllItems, assetUrl } from '../directus'
import { allTeamDefs, expandDisplayName, type TeamDef } from '../../data/teams'

interface DirectusTeam {
  id: number; name: string; sport: string; league: string; color: string;
  team_picture: string | null; active: boolean; full_name: string; season: string;
}

export interface Team extends TeamDef {
  league: string; photoUrl: string; season: string;
}

// Memoised for the build: the nav (Header), listing pages and detail-page
// routing all call this — one fetch per build is enough. A rejection clears the
// cache so a transient build-time failure can retry instead of poisoning every
// caller into the static fallback.
let _activeTeams: Promise<Team[]> | null = null
export function getActiveTeams(): Promise<Team[]> {
  if (!_activeTeams) {
    _activeTeams = fetchActiveTeams().catch((err) => { _activeTeams = null; throw err })
  }
  return _activeTeams
}

async function fetchActiveTeams(): Promise<Team[]> {
  // NOTE: do NOT request `slug` — it's a website-only concept, not a `teams`
  // column. Querying it 400s (FORBIDDEN), which silently sent every caller to
  // the static fallback (stale leagues everywhere). slug comes from the def.
  const items = await fetchAllItems<DirectusTeam>('teams', {
    filter: { active: { _eq: true } },
    sort: ['sport', 'name'],
    fields: ['id', 'name', 'sport', 'league', 'color', 'team_picture', 'full_name', 'season'],
  })
  return items
    .map(t => {
      // Volleyball defs match the live Directus short name — season-robust and
      // it follows the D1/D2 league swap (whichever team is named "D1" gets the
      // d1 slug + its live league). Basketball stays directusId-matched.
      const def = allTeamDefs.find(d =>
        d.teamName ? (d.sport === t.sport && d.teamName === t.name) : d.directusId === String(t.id),
      )
      if (!def) return null
      const live = !!def.teamName
      return {
        ...def,
        directusId: String(t.id),                                       // live id (used for detail-page routing)
        displayName: live ? expandDisplayName(t.name) : def.displayName,
        chipLabel: live ? t.name : def.chipLabel,
        league: t.league,
        photoUrl: assetUrl(t.team_picture, 'width=640&quality=80'),
        season: t.season,
      }
    })
    .filter((t): t is Team => t !== null)
}

export async function getTeamsBySport(sport: string): Promise<Team[]> {
  const teams = await getActiveTeams()
  return teams.filter(t => t.sport === sport)
}
