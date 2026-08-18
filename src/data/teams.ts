/**
 * Comprehensive team definitions for the KSCW website.
 *
 * Static metadata (slug, category, display name, colors, trainings) lives here.
 * Dynamic data (league, team_picture) is fetched from Directus at build time
 * and merged in via fetch modules.
 */

// ─── Types ─────────────────────────────────────────────────────────

export type TeamCategory = 'men' | 'women' | 'youth';
export type Sport = 'volleyball' | 'basketball';

export interface Training {
  day: 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so';
  start: string;
  end: string;
}

export interface TeamDef {
  directusId: string;
  /** Stable Directus external id (e.g. "bb_1348", "vb_2743"). When set, the team
   *  is matched to live Directus data by this id instead of directusId/teamName.
   *  It's the season-stable key the backend itself uses for rollover follow-through
   *  (the numeric `id` is reassigned every June), so it survives both the season
   *  rollover AND team renames. Basketball matches on this; volleyball still matches
   *  on teamName pending the team_id sweep. */
  team_id?: string;
  /** Stable Directus short name (e.g. "D1", "HU23-1", "Legends"). When set,
   *  the team is matched to live Directus data by this name instead of
   *  directusId — survives season rollover AND the D1/D2 league swap, since
   *  the live league/id follow whichever team currently holds the name.
   *  Volleyball only; basketball matches by team_id. */
  teamName?: string;
  slug: string;
  sport: Sport;
  category: TeamCategory;
  chipLabel: string;
  displayName: string;
  order: number;
  chipBg: string;
  chipText: string;
  /** Live weekly training summary is attached at build time from Directus hall
   *  slots (see lib/fetch/teams.ts); defs no longer carry static trainings.
   *  Optional + only populated on the merged Team object. */
  trainings?: Training[];
  /** Whether this team has its own /volleyball/:slug or /basketball/:slug detail page */
  hasDetailPage: boolean;
  /** Override link path (e.g., "teams/nachwuchs#hu18" for BB youth) */
  linkOverride?: string;
  /** Fallback league text shown if Directus fetch fails */
  fallbackLeague?: string;
  /** Take the chip + display name from the live Directus name instead of the
   *  static ones below. For teams the club distinguishes by name rather than by
   *  age group — the two U18 girls' squads — where a static label would show
   *  the same text twice and go stale on the next rename. */
  useLiveName?: boolean;
}

/** TeamDef enriched with Directus data at build time */
export interface TeamData extends TeamDef {
  league: string;
  photoUrl: string | null;
}

// ─── Day name formatting ───────────────────────────────────────────

const dayNamesDe: Record<Training['day'], string> = {
  mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So',
};

const dayNamesEn: Record<Training['day'], string> = {
  mo: 'Mon', di: 'Tue', mi: 'Wed', do: 'Thu', fr: 'Fri', sa: 'Sat', so: 'Sun',
};

export function formatTrainings(trainings: Training[] | undefined, locale: 'de' | 'en'): string {
  if (!trainings?.length) return '';
  const names = locale === 'de' ? dayNamesDe : dayNamesEn;
  const dash = locale === 'de' ? '\u2013' : '-';
  return trainings.map(t => `${names[t.day]} ${t.start}${dash}${t.end}`).join(', ');
}

/** Extract a short badge label from a league string */
export function getBadgeText(league: string, teamName: string): string {
  // Youth teams: show the U-level
  const uMatch = teamName.match(/U\d+/);
  if (uMatch) return uMatch[0];
  // Main teams: extract Liga level (e.g., "2. Liga" from "Herren 2. Liga")
  const ligaMatch = league.match(/(\d+)\.\s*Liga/);
  if (ligaMatch) return `${ligaMatch[1]}. Liga`;
  // Volleymanager terse code ("2L", "5L") → "2. Liga" until the Swiss Volley
  // API publishes the long-form league for the season.
  const terse = league.match(/^(\d+)L$/);
  if (terse) return `${terse[1]}. Liga`;
  // ProBasket federation codes: gender letter, league number, then a region suffix —
  // H1LRA, H3LS, H4LZ, D1LRA, D3LR. Nothing here handled them, so the fallthrough
  // below printed the raw code and a visitor could not tell a first-league squad
  // from a fourth. Youth codes (DU12Tu, MixU10M, HU 18B) never reach this line: the
  // U-level match on the team NAME above catches them, and none of them has a digit
  // immediately after the leading letter anyway.
  const bbLeague = league.match(/^[DHM](\d+)L/);
  if (bbLeague) return `${bbLeague[1]}. Liga`;
  // The veterans' category, which ProBasket writes as "D-Classics" / "H-Classics".
  if (/^[DHM]-Classics$/i.test(league)) return 'Classics';
  return league;
}

/** Expand a Directus short name into the website's display name.
 *  D1 → "Damen 1", H2 → "Herren 2", DU23-1 → "Damen U23-1", HU20 → "Herren U20".
 *  Names without a D/H gender prefix (Legends, MiniVB) pass through unchanged. */
export function expandDisplayName(name: string): string {
  const gender = (c: string) => (c === 'D' ? 'Damen' : c === 'M' ? 'Mixed' : 'Herren');
  // Trailing group: the club gives second squads a word rather than a number
  // ("DU18 Spark", "DU18 Fire"), and that word is what tells them apart.
  const youth = name.match(/^([DHM])U\s*0*(\d+)(?:-(\d+))?\s*(.*)$/);
  if (youth) {
    return `${gender(youth[1])} U${Number(youth[2])}`
      + (youth[3] ? `-${youth[3]}` : '')
      + (youth[4] ? ` ${youth[4].trim()}` : '');
  }
  const senior = name.match(/^([DH])(\d+)$/);
  if (senior) return `${gender(senior[1])} ${senior[2]}`;
  return name;
}

// ─── Volleyball Teams ──────────────────────────────────────────────

const volleyballMen: TeamDef[] = [
  {
    directusId: '95', teamName: 'H1', slug: 'h1', sport: 'volleyball', category: 'men',
    chipLabel: 'H1', displayName: 'Herren 1', order: 1,
    chipBg: '#1e40af', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Herren 2. Liga',
  },
  {
    directusId: '93', teamName: 'H2', slug: 'h2', sport: 'volleyball', category: 'men',
    chipLabel: 'H2', displayName: 'Herren 2', order: 2,
    chipBg: '#2563eb', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Herren 3. Liga Gruppe A',
  },
  {
    directusId: '92', teamName: 'H3', slug: 'h3', sport: 'volleyball', category: 'men',
    chipLabel: 'H3', displayName: 'Herren 3', order: 3,
    chipBg: '#3b82f6', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Herren 3. Liga Gruppe B',
  },
  {
    directusId: '82', teamName: 'Legends', slug: 'legends', sport: 'volleyball', category: 'men',
    chipLabel: 'Legends', displayName: 'Legends', order: 4,
    chipBg: '#1e3a5f', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Herren 4. Liga Gruppe A',
  },
];

const volleyballWomen: TeamDef[] = [
  {
    directusId: '80', teamName: 'D1', slug: 'd1', sport: 'volleyball', category: 'women',
    chipLabel: 'D1', displayName: 'Damen 1', order: 1,
    chipBg: '#be123c', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Frauen 3. Liga Gruppe A',
  },
  {
    directusId: '94', teamName: 'D2', slug: 'd2', sport: 'volleyball', category: 'women',
    chipLabel: 'D2', displayName: 'Damen 2', order: 2,
    chipBg: '#e11d48', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'Frauen 3. Liga Gruppe B',
  },
  {
    directusId: '81', teamName: 'D3', slug: 'd3', sport: 'volleyball', category: 'women',
    chipLabel: 'D3', displayName: 'Damen 3', order: 3,
    chipBg: '#f43f5e', chipText: '#881337',
    hasDetailPage: true, fallbackLeague: 'Frauen 5. Liga Gruppe A',
  },
  {
    directusId: '97', teamName: 'D4', slug: 'd4', sport: 'volleyball', category: 'women',
    chipLabel: 'D4', displayName: 'Damen 4', order: 4,
    chipBg: '#fb7185', chipText: '#881337',
    hasDetailPage: true, fallbackLeague: 'Frauen 5. Liga Gruppe B',
  },
];

const volleyballYouth: TeamDef[] = [
  {
    directusId: '67', teamName: 'DU23-1', slug: 'du23-1', sport: 'volleyball', category: 'youth',
    chipLabel: 'DU23-1', displayName: 'Damen U23-1', order: 1,
    chipBg: '#fda4af', chipText: '#881337',
    hasDetailPage: true, fallbackLeague: 'Frauen U23 1. Liga',
  },
  {
    directusId: '66', teamName: 'HU23-1', slug: 'hu23', sport: 'volleyball', category: 'youth',
    chipLabel: 'HU23', displayName: 'Herren U23', order: 3,
    chipBg: '#60a5fa', chipText: '#1e3a8a',
    hasDetailPage: true, fallbackLeague: 'Männer U23 Gruppe A',
  },
  {
    directusId: '79', teamName: 'HU20', slug: 'hu20', sport: 'volleyball', category: 'youth',
    chipLabel: 'HU20', displayName: 'Herren U20', order: 4,
    chipBg: '#93c5fd', chipText: '#1e3a8a',
    hasDetailPage: true, fallbackLeague: 'HU20',
  },
  {
    // Girls' U20. Active in Directus (vb_00001) but had NO def here, so
    // lib/fetch/teams.ts dropped it on every build — it appeared nowhere on the
    // site: not in the nav, not on /volleyball, no detail page. Rose-pink to match
    // the other Damen youth squads.
    directusId: '68', teamName: 'DU20', slug: 'du20', sport: 'volleyball', category: 'youth',
    chipLabel: 'DU20', displayName: 'Damen U20', order: 5,
    chipBg: '#fda4af', chipText: '#881337',
    hasDetailPage: true, fallbackLeague: 'DU20',
  },
];

// ─── Basketball Teams ──────────────────────────────────────────────

const basketballWomen: TeamDef[] = [
  {
    directusId: '86', team_id: 'bb_4445', slug: 'lions', sport: 'basketball', category: 'women',
    chipLabel: 'Lions', displayName: 'Lions', order: 1,
    chipBg: '#6d28d9', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'D1LRA',
  },
  {
    directusId: '89', team_id: 'bb_1077', slug: 'rhinos', sport: 'basketball', category: 'women',
    chipLabel: 'Rhinos', displayName: 'Rhinos', order: 2,
    chipBg: '#059669', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'D3LR',
  },
  {
    // Veterans. Same silent-drop story as H-Classics; colours already existed as
    // 'BB-D-Classics'.
    directusId: '69', team_id: 'bb_4934', slug: 'd-classics', sport: 'basketball', category: 'women',
    chipLabel: 'BB-D-Classics', displayName: 'D-Classics', order: 3,
    chipBg: '#581c87', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'D-Classics', useLiveName: true,
  },
];

// ⚠ The three men's teams take their name from LIVE Directus (useLiveName), because
// the static labels below had drifted a full squad out of step: slug `h3` was labelled
// "Herren 3" while Directus (and therefore the team page's own <h1>) calls it
// "Herren 2", and `h4` was "Herren 4" against "Unicorns Herren 3". The nav and the
// page it linked to disagreed. The displayName values are kept as the
// Directus-unreachable fallback only. Lions and Rhinos keep their static names —
// those are stable brand names, not numbered squads that shuffle at the rollover.
const basketballMen: TeamDef[] = [
  {
    directusId: '75', team_id: 'bb_1348', slug: 'h1', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H1', displayName: 'Herren 1', order: 1,
    chipBg: '#9a3412', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'H1LRA', useLiveName: true,
  },
  {
    directusId: '76', team_id: 'bb_4829', slug: 'h3', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H3', displayName: 'Herren 3', order: 2,
    chipBg: '#c2410c', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'H3LS', useLiveName: true,
  },
  {
    directusId: '77', team_id: 'bb_7183', slug: 'h4', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H4', displayName: 'Herren 4', order: 3,
    chipBg: '#ea580c', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'H4LZ', useLiveName: true,
  },
  {
    // Veterans. Active in Directus but had no def, so it was dropped silently on
    // every build. Colours already existed in team-colors.ts as 'BB-H-Classics'.
    directusId: '74', team_id: 'bb_4935', slug: 'h-classics', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H-Classics', displayName: 'H-Classics', order: 4,
    chipBg: '#78350f', chipText: '#ffffff',
    hasDetailPage: true, fallbackLeague: 'H-Classics', useLiveName: true,
  },
];

const basketballYouth: TeamDef[] = [
  {
    directusId: '26', team_id: 'bb_5789', slug: 'hu18', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU18', displayName: 'Herren U18', order: 1,
    chipBg: '#f97316', chipText: '#ffffff',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu18',
  },
  {
    directusId: '25', team_id: 'bb_5498', slug: 'hu16', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU16', displayName: 'Herren U16', order: 2,
    chipBg: '#fb923c', chipText: '#7c2d12',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu16',
  },
  {
    directusId: '24', team_id: 'bb_5790', slug: 'hu14', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU14', displayName: 'Herren U14', order: 3,
    chipBg: '#fdba74', chipText: '#7c2d12',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu14',
  },
  {
    directusId: '23', team_id: 'bb_5791', slug: 'hu12', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU12', displayName: 'Herren U12', order: 4,
    chipBg: '#fed7aa', chipText: '#7c2d12',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu12',
  },
  // 2026/27 runs TWO U18 girls' squads (DU18 Spark, DU18 Fire) and no U16
  // girls' team. bb_7182 was the DU16 def and is now the second U18 one — the
  // team_id is stable across the rename, so it keeps its identity here. Both
  // take their label from Directus: "Damen U18" twice would say nothing.
  {
    directusId: '18', team_id: 'bb_5697', slug: 'du18', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU18', displayName: 'Damen U18', order: 5,
    chipBg: '#c084fc', chipText: '#581c87', useLiveName: true,
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du18',
  },
  {
    directusId: '17', team_id: 'bb_7182', slug: 'du18-2', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU18', displayName: 'Damen U18', order: 6,
    chipBg: '#d8b4fe', chipText: '#581c87', useLiveName: true,
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du18',
  },
  {
    directusId: '16', team_id: 'bb_5441', slug: 'du14', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU14', displayName: 'Damen U14', order: 7,
    chipBg: '#e9d5ff', chipText: '#581c87',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du14',
  },
  {
    directusId: '15', team_id: 'bb_5104', slug: 'du12', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU12', displayName: 'Damen U12', order: 8,
    chipBg: '#f3e8ff', chipText: '#581c87',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du12',
  },
  {
    directusId: '', team_id: 'bb_7444', slug: 'du10', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU10', displayName: 'Damen U10', order: 9,
    chipBg: '#faf5ff', chipText: '#581c87',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du10',
  },
  {
    directusId: '28', team_id: 'bb_5287', slug: 'mu10', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-MU10', displayName: 'Mixed U10', order: 10,
    chipBg: '#14b8a6', chipText: '#042f2e',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#mu10',
  },
  {
    directusId: '29', team_id: 'bb_6724', slug: 'mu8', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-MU8', displayName: 'Mixed U8', order: 11,
    chipBg: '#0d9488', chipText: '#ffffff',
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#mu8',
  },
];

// ─── Exports ───────────────────────────────────────────────────────

export const allTeamDefs: TeamDef[] = [
  ...volleyballMen, ...volleyballWomen, ...volleyballYouth,
  ...basketballWomen, ...basketballMen, ...basketballYouth,
];

/** Get teams for a given sport + category, sorted by order */
export function getTeamDefs(sport: Sport, category: TeamCategory): TeamDef[] {
  return allTeamDefs
    .filter(t => t.sport === sport && t.category === category)
    .sort((a, b) => a.order - b.order);
}
