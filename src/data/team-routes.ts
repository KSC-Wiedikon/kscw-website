export interface TeamRoute {
  slug: string;
  directusId: string;
  short: string;
  sport: 'volleyball' | 'basketball';
}

export const volleyballTeams: TeamRoute[] = [
  { slug: 'h1', directusId: '95', short: 'H1', sport: 'volleyball' },
  { slug: 'h2', directusId: '93', short: 'H2', sport: 'volleyball' },
  { slug: 'h3', directusId: '92', short: 'H3', sport: 'volleyball' },
  { slug: 'legends', directusId: '82', short: 'Legends', sport: 'volleyball' },
  { slug: 'd1', directusId: '80', short: 'D1', sport: 'volleyball' },
  { slug: 'd2', directusId: '94', short: 'D2', sport: 'volleyball' },
  { slug: 'd3', directusId: '81', short: 'D3', sport: 'volleyball' },
  { slug: 'd4', directusId: '97', short: 'D4', sport: 'volleyball' },
  { slug: 'du23-1', directusId: '67', short: 'DU23-1', sport: 'volleyball' },
  { slug: 'hu23', directusId: '66', short: 'HU23', sport: 'volleyball' },
  { slug: 'hu20', directusId: '79', short: 'HU20', sport: 'volleyball' },
  { slug: 'du20', directusId: '68', short: 'DU20', sport: 'volleyball' },
];

export const basketballTeams: TeamRoute[] = [
  { slug: 'h1', directusId: '75', short: 'BB-H1', sport: 'basketball' },
  { slug: 'h3', directusId: '76', short: 'BB-H3', sport: 'basketball' },
  { slug: 'h4', directusId: '77', short: 'BB-H4', sport: 'basketball' },
  { slug: 'lions', directusId: '86', short: 'BB-Lions D1', sport: 'basketball' },
  { slug: 'rhinos', directusId: '89', short: 'BB-Rhinos D3', sport: 'basketball' },
  { slug: 'h-classics', directusId: '74', short: 'BB-H-Classics', sport: 'basketball' },
  { slug: 'd-classics', directusId: '69', short: 'BB-D-Classics', sport: 'basketball' },
];

export const allTeams = [...volleyballTeams, ...basketballTeams];
