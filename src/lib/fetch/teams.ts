import { directusFetch, assetUrl } from '../directus'
import { allTeamDefs, expandDisplayName, type TeamDef, type Training } from '../../data/teams'
import { volleyballTeams, basketballTeams } from '../../data/team-routes'

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

// The retry that absorbs a Directus restart now lives in directusFetch, so every
// build-time fetch gets it rather than this one call site (the 18.08.2026 deploy
// died on /items/teams, which had none). What stays here is the log line: a
// fallback to the static defs silently ships stale leagues, so it must be
// findable in the build output (happened in prod 2026-06-03).
async function fetchActiveTeamsRaw(): Promise<DirectusTeam[]> {
  try {
    // Custom endpoint (not /items/teams): it exposes the season-stable `team_id`
    // and a live weekly training summary, neither of which the public role can
    // read off the raw `teams` collection. Returns only active teams already.
    return await directusFetch<DirectusTeam[]>('/kscw/public/teams')
  } catch (err) {
    console.warn('[teams] live fetch failed — falling back to static defs:', err)
    throw err
  }
}

async function fetchActiveTeams(): Promise<Team[]> {
  const items = await fetchActiveTeamsRaw()
  const mapped = items
    .map(t => {
      // Match priority: team_id (season-stable external id, used by basketball) →
      // teamName (volleyball short name; follows the D1/D2 league swap) → directusId
      // (legacy fallback). team_id survives both the June rollover and renames.
      const def = allTeamDefs.find(d =>
        d.team_id ? (d.sport === t.sport && d.team_id === t.team_id)
          : d.teamName ? (d.sport === t.sport && d.teamName === t.name)
            : d.directusId === String(t.id),
      )
      if (!def) {
        // ⚠ Silent drop. This is how DU20 (the girls' U20 volleyball squad) and both
        // Classics teams stayed invisible on the whole site — no nav entry, no card,
        // no detail page, and nothing anywhere to say so. A team the club adds in
        // Directus simply never appears until someone hand-writes a def below.
        //
        // The warning does not fix that, but it turns a silent omission into a line
        // in the build log, which is what makes the next one findable.
        console.warn(
          `[teams] live team has no def in src/data/teams.ts and was DROPPED — `
          + `id=${t.id} team_id=${t.team_id ?? '—'} sport=${t.sport} name="${t.name}". `
          + `It will not appear anywhere on the site until a TeamDef is added.`,
        )
        return null
      }
      const live = !!def.teamName || def.useLiveName === true
      return {
        ...def,
        directusId: String(t.id),                                       // live id (used for detail-page routing)
        displayName: live ? expandDisplayName(t.name) : def.displayName,
        chipLabel: live ? t.name : def.chipLabel,
        league: t.league,
        photoUrl: assetUrl(t.team_picture, 'width=640&quality=80'),
        season: t.season,
        // Live hall slots from /kscw/public/teams. Defs no longer carry static
        // trainings, so a team with none shows no training line (and the whole-
        // fetch-failed fallback path below renders none too).
        trainings: Array.isArray(t.trainings) ? t.trainings : [],
      }
    })
    .filter((t): t is Team => t !== null)

  reportTableDrift(items, mapped)
  return mapped
}

/**
 * Say out loud, once per build, where the two hand-maintained tables have drifted
 * from Directus.
 *
 * `src/data/teams.ts` and `src/data/team-routes.ts` are the only part of this site
 * nothing keeps in step with reality. They are consulted ONLY when the live fetch
 * fails, which is the whole problem: a wrong entry costs nothing on a good day and
 * is invisible on a bad one. DU23-2 was retired at the June 2026 rollover and sat
 * in both tables until 18.08.2026, when a build that fell back during a Directus
 * restart rebuilt /volleyball/du23-2 — and the only thing that noticed was a 404
 * e2e test, three jobs downstream of the actual cause.
 *
 * A warning, not a failure. The live path is correct whenever Directus answers, so
 * drift must never block a deploy — it just has to stop being silent.
 */
function reportTableDrift(live: DirectusTeam[], mapped: Team[]): void {
  const seen = new Set(mapped.map((t) => `${t.sport}/${t.slug}`))
  const routes = [...volleyballTeams, ...basketballTeams]

  // A def (or route) that no live team matched. Its page is gone from the real
  // site, but a fallback build will happily rebuild it — into the sitemap and the
  // search index too, since both read live-first and fall back to these tables.
  const retired = [
    ...allTeamDefs.filter((d) => !seen.has(`${d.sport}/${d.slug}`))
      .map((d) => `${d.sport}/${d.slug} (teams.ts)`),
    ...routes.filter((r) => !seen.has(`${r.sport}/${r.slug}`))
      .map((r) => `${r.sport}/${r.slug} (team-routes.ts)`),
  ]
  if (retired.length) {
    console.warn(
      '[teams] RETIRED entries still in the hand-maintained tables — a build that '
      + 'falls back to them will resurrect these pages: ' + retired.join(', '),
    )
  }

  // Ids are the softer case: /kscw/public/team/:id hops an archived row to the
  // active one sharing its `team_id`, so a stale id still resolves. It resolves to
  // the SQUAD though, not to the label — so when a label moves between squads at
  // the rollover (the D1/D2 swap), a stale id quietly renders the other team.
  const drifted = routes.flatMap((r) => {
    const t = mapped.find((m) => m.sport === r.sport && m.slug === r.slug)
    return t && t.directusId !== r.directusId
      ? [`${r.sport}/${r.slug} table=${r.directusId} live=${t.directusId}`]
      : []
  })
  if (drifted.length) {
    console.warn(
      '[teams] table ids are a season behind (harmless while the archived-row hop '
      + 'holds, wrong the moment a label moves between squads): ' + drifted.join(', '),
    )
  }

  // The reverse direction is already warned per-team above, but a count makes the
  // shape of the drift readable at a glance.
  const dropped = live.length - mapped.length
  if (dropped > 0) console.warn(`[teams] ${dropped} live team(s) dropped for want of a def.`)
}

export async function getTeamsBySport(sport: string): Promise<Team[]> {
  const teams = await getActiveTeams()
  return teams.filter(t => t.sport === sport)
}
