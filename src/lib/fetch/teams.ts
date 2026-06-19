import { directusFetch, assetUrl } from '../directus'
import { allTeamDefs, expandDisplayName, type TeamDef, type Training } from '../../data/teams'

/** A weekly training slot derived from live hall slots by /kscw/public/teams. */
interface LiveTraining {
  day: Training['day']; start: string; end: string;
  hall_name: string | null; hall_address: string | null;
}

interface DirectusTeam {
  id: number; team_id: string | null; name: string; sport: string; league: string;
  color: string; team_picture: string | null; full_name: string; season: string;
  /** Weekly training summary from live hall slots (Mon→Sun). */
  trainings?: LiveTraining[];
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

// Retry the live fetch a few times before giving up. A single transient blip
// during the build otherwise drops every caller to the static fallback and
// silently ships stale leagues (happened in prod 2026-06-03). Retrying absorbs
// the blip so the build self-heals; a genuine outage still falls back (logged).
async function fetchActiveTeamsRaw(attempts = 3): Promise<DirectusTeam[]> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      // Custom endpoint (not /items/teams): it exposes the season-stable `team_id`
      // and a live weekly training summary, neither of which the public role can
      // read off the raw `teams` collection. Returns only active teams already.
      return await directusFetch<DirectusTeam[]>('/kscw/public/teams')
    } catch (err) {
      lastErr = err
      if (i < attempts) await new Promise((r) => setTimeout(r, 400 * i))
    }
  }
  console.warn(`[teams] live fetch failed after ${attempts} attempts — falling back to static defs:`, lastErr)
  throw lastErr
}

async function fetchActiveTeams(): Promise<Team[]> {
  const items = await fetchActiveTeamsRaw()
  return items
    .map(t => {
      // Match priority: team_id (season-stable external id, used by basketball) →
      // teamName (volleyball short name; follows the D1/D2 league swap) → directusId
      // (legacy fallback). team_id survives both the June rollover and renames.
      const def = allTeamDefs.find(d =>
        d.team_id ? (d.sport === t.sport && d.team_id === t.team_id)
          : d.teamName ? (d.sport === t.sport && d.teamName === t.name)
            : d.directusId === String(t.id),
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
        // Prefer live hall slots; fall back to the static def trainings only when
        // the endpoint didn't supply them (e.g. older backend not yet deployed).
        trainings: Array.isArray(t.trainings) ? t.trainings : def.trainings,
      }
    })
    .filter((t): t is Team => t !== null)
}

export async function getTeamsBySport(sport: string): Promise<Team[]> {
  const teams = await getActiveTeams()
  return teams.filter(t => t.sport === sport)
}
