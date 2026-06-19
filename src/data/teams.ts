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
  trainings: Training[];
  /** Whether this team has its own /volleyball/:slug or /basketball/:slug detail page */
  hasDetailPage: boolean;
  /** Override link path (e.g., "teams/nachwuchs#hu18" for BB youth) */
  linkOverride?: string;
  /** Fallback league text shown if Directus fetch fails */
  fallbackLeague?: string;
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

export function formatTrainings(trainings: Training[], locale: 'de' | 'en'): string {
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
  return league;
}

/** Expand a Directus short name into the website's display name.
 *  D1 → "Damen 1", H2 → "Herren 2", DU23-1 → "Damen U23-1", HU20 → "Herren U20".
 *  Names without a D/H gender prefix (Legends, MiniVB) pass through unchanged. */
export function expandDisplayName(name: string): string {
  const gender = (c: string) => (c === 'D' ? 'Damen' : 'Herren');
  const youth = name.match(/^([DH])U(\d+)(?:-(\d+))?$/);
  if (youth) return `${gender(youth[1])} U${youth[2]}${youth[3] ? `-${youth[3]}` : ''}`;
  const senior = name.match(/^([DH])(\d+)$/);
  if (senior) return `${gender(senior[1])} ${senior[2]}`;
  return name;
}

// ─── Volleyball Teams ──────────────────────────────────────────────

const volleyballMen: TeamDef[] = [
  {
    directusId: '1', teamName: 'H1', slug: 'h1', sport: 'volleyball', category: 'men',
    chipLabel: 'H1', displayName: 'Herren 1', order: 1,
    chipBg: '#1e40af', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '19:30', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Herren 2. Liga',
  },
  {
    directusId: '2', teamName: 'H2', slug: 'h2', sport: 'volleyball', category: 'men',
    chipLabel: 'H2', displayName: 'Herren 2', order: 2,
    chipBg: '#2563eb', chipText: '#ffffff',
    trainings: [{ day: 'mo', start: '20:00', end: '21:30' }, { day: 'mi', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Herren 3. Liga Gruppe A',
  },
  {
    directusId: '3', teamName: 'H3', slug: 'h3', sport: 'volleyball', category: 'men',
    chipLabel: 'H3', displayName: 'Herren 3', order: 3,
    chipBg: '#3b82f6', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Herren 3. Liga Gruppe B',
  },
  {
    directusId: '11', teamName: 'Legends', slug: 'legends', sport: 'volleyball', category: 'men',
    chipLabel: 'Legends', displayName: 'Legends', order: 4,
    chipBg: '#1e3a5f', chipText: '#ffffff',
    trainings: [{ day: 'mi', start: '20:30', end: '22:00' }],
    hasDetailPage: true, fallbackLeague: 'Herren 4. Liga Gruppe A',
  },
];

const volleyballWomen: TeamDef[] = [
  {
    directusId: '4', teamName: 'D1', slug: 'd1', sport: 'volleyball', category: 'women',
    chipLabel: 'D1', displayName: 'Damen 1', order: 1,
    chipBg: '#be123c', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '19:30', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen 3. Liga Gruppe A',
  },
  {
    directusId: '5', teamName: 'D2', slug: 'd2', sport: 'volleyball', category: 'women',
    chipLabel: 'D2', displayName: 'Damen 2', order: 2,
    chipBg: '#e11d48', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen 3. Liga Gruppe B',
  },
  {
    directusId: '6', teamName: 'D3', slug: 'd3', sport: 'volleyball', category: 'women',
    chipLabel: 'D3', displayName: 'Damen 3', order: 3,
    chipBg: '#f43f5e', chipText: '#881337',
    trainings: [{ day: 'mo', start: '20:00', end: '21:30' }, { day: 'mi', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen 5. Liga Gruppe A',
  },
  {
    directusId: '7', teamName: 'D4', slug: 'd4', sport: 'volleyball', category: 'women',
    chipLabel: 'D4', displayName: 'Damen 4', order: 4,
    chipBg: '#fb7185', chipText: '#881337',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen 5. Liga Gruppe B',
  },
];

const volleyballYouth: TeamDef[] = [
  {
    directusId: '9', teamName: 'DU23-1', slug: 'du23-1', sport: 'volleyball', category: 'youth',
    chipLabel: 'DU23-1', displayName: 'Damen U23-1', order: 1,
    chipBg: '#fda4af', chipText: '#881337',
    trainings: [{ day: 'mo', start: '19:00', end: '20:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen U23 1. Liga',
  },
  {
    directusId: '10', teamName: 'DU23-2', slug: 'du23-2', sport: 'volleyball', category: 'youth',
    chipLabel: 'DU23-2', displayName: 'Damen U23-2', order: 2,
    chipBg: '#fda4af', chipText: '#881337',
    trainings: [{ day: 'mo', start: '19:00', end: '20:30' }],
    hasDetailPage: true, fallbackLeague: 'Frauen U23 2. Liga',
  },
  {
    directusId: '8', teamName: 'HU23-1', slug: 'hu23', sport: 'volleyball', category: 'youth',
    chipLabel: 'HU23', displayName: 'Herren U23', order: 3,
    chipBg: '#60a5fa', chipText: '#1e3a8a',
    trainings: [{ day: 'di', start: '18:00', end: '19:30' }],
    hasDetailPage: true, fallbackLeague: 'Männer U23 Gruppe A',
  },
  {
    directusId: '12', teamName: 'HU20', slug: 'hu20', sport: 'volleyball', category: 'youth',
    chipLabel: 'HU20', displayName: 'Herren U20', order: 4,
    chipBg: '#93c5fd', chipText: '#1e3a8a',
    trainings: [{ day: 'mi', start: '18:00', end: '19:30' }],
    hasDetailPage: true, fallbackLeague: 'HU20',
  },
];

// ─── Basketball Teams ──────────────────────────────────────────────

const basketballWomen: TeamDef[] = [
  {
    directusId: '27', team_id: 'bb_4445', slug: 'lions', sport: 'basketball', category: 'women',
    chipLabel: 'Lions', displayName: 'Lions', order: 1,
    chipBg: '#6d28d9', chipText: '#ffffff',
    trainings: [{ day: 'mo', start: '20:00', end: '21:30' }, { day: 'do', start: '19:30', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'D1LRA',
  },
  {
    directusId: '30', team_id: 'bb_1077', slug: 'rhinos', sport: 'basketball', category: 'women',
    chipLabel: 'Rhinos', displayName: 'Rhinos', order: 2,
    chipBg: '#059669', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'D3LR',
  },
];

const basketballMen: TeamDef[] = [
  {
    directusId: '20', team_id: 'bb_1348', slug: 'h1', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H1', displayName: 'Herren 1', order: 1,
    chipBg: '#9a3412', chipText: '#ffffff',
    trainings: [{ day: 'mo', start: '20:00', end: '21:30' }, { day: 'mi', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'H1LRA',
  },
  {
    directusId: '21', team_id: 'bb_4829', slug: 'h3', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H3', displayName: 'Herren 3', order: 2,
    chipBg: '#c2410c', chipText: '#ffffff',
    trainings: [{ day: 'di', start: '20:00', end: '21:30' }, { day: 'do', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'H3LS',
  },
  {
    directusId: '22', team_id: 'bb_7183', slug: 'h4', sport: 'basketball', category: 'men',
    chipLabel: 'BB-H4', displayName: 'Herren 4', order: 3,
    chipBg: '#ea580c', chipText: '#ffffff',
    trainings: [{ day: 'mi', start: '20:00', end: '21:30' }],
    hasDetailPage: true, fallbackLeague: 'H4LZ',
  },
];

const basketballYouth: TeamDef[] = [
  {
    directusId: '26', team_id: 'bb_5789', slug: 'hu18', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU18', displayName: 'Herren U18', order: 1,
    chipBg: '#f97316', chipText: '#ffffff',
    trainings: [{ day: 'mo', start: '18:00', end: '19:30' }, { day: 'mi', start: '18:00', end: '19:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu18',
  },
  {
    directusId: '25', team_id: 'bb_5498', slug: 'hu16', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU16', displayName: 'Herren U16', order: 2,
    chipBg: '#fb923c', chipText: '#7c2d12',
    trainings: [{ day: 'di', start: '17:30', end: '19:00' }, { day: 'do', start: '17:30', end: '19:00' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu16',
  },
  {
    directusId: '24', team_id: 'bb_5790', slug: 'hu14', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU14', displayName: 'Herren U14', order: 3,
    chipBg: '#fdba74', chipText: '#7c2d12',
    trainings: [{ day: 'mo', start: '17:00', end: '18:30' }, { day: 'mi', start: '17:00', end: '18:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu14',
  },
  {
    directusId: '23', team_id: 'bb_5791', slug: 'hu12', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-HU12', displayName: 'Herren U12', order: 4,
    chipBg: '#fed7aa', chipText: '#7c2d12',
    trainings: [{ day: 'di', start: '16:00', end: '17:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#hu12',
  },
  {
    directusId: '18', team_id: 'bb_5697', slug: 'du18', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU18', displayName: 'Damen U18', order: 5,
    chipBg: '#c084fc', chipText: '#581c87',
    trainings: [{ day: 'mo', start: '17:30', end: '19:00' }, { day: 'mi', start: '17:30', end: '19:00' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du18',
  },
  {
    directusId: '17', team_id: 'bb_7182', slug: 'du16', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU16', displayName: 'Damen U16', order: 6,
    chipBg: '#d8b4fe', chipText: '#581c87',
    trainings: [{ day: 'di', start: '17:00', end: '18:30' }, { day: 'do', start: '17:00', end: '18:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du16',
  },
  {
    directusId: '16', team_id: 'bb_5441', slug: 'du14', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU14', displayName: 'Damen U14', order: 7,
    chipBg: '#e9d5ff', chipText: '#581c87',
    trainings: [{ day: 'mo', start: '16:00', end: '17:30' }, { day: 'mi', start: '16:00', end: '17:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du14',
  },
  {
    directusId: '15', team_id: 'bb_5104', slug: 'du12', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU12', displayName: 'Damen U12', order: 8,
    chipBg: '#f3e8ff', chipText: '#581c87',
    trainings: [{ day: 'di', start: '16:00', end: '17:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du12',
  },
  {
    directusId: '', team_id: 'bb_7444', slug: 'du10', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-DU10', displayName: 'Damen U10', order: 9,
    chipBg: '#faf5ff', chipText: '#581c87',
    trainings: [{ day: 'sa', start: '10:00', end: '11:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#du10',
  },
  {
    directusId: '28', team_id: 'bb_5287', slug: 'mu10', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-MU10', displayName: 'Mixed U10', order: 10,
    chipBg: '#14b8a6', chipText: '#042f2e',
    trainings: [{ day: 'sa', start: '09:00', end: '10:30' }],
    hasDetailPage: false, linkOverride: 'teams/nachwuchs#mu10',
  },
  {
    directusId: '29', team_id: 'bb_6724', slug: 'mu8', sport: 'basketball', category: 'youth',
    chipLabel: 'BB-MU8', displayName: 'Mixed U8', order: 11,
    chipBg: '#0d9488', chipText: '#ffffff',
    trainings: [{ day: 'sa', start: '10:30', end: '12:00' }],
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
