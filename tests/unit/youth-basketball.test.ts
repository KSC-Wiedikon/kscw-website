import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_WAITLIST_URL, cardCode, cardTitle, dedupeSlots, isCurrentOrUpcoming,
  slotTargets, type DirectusSlot, type YouthSlot,
} from 'src/lib/fetch/youthBasketball';

const slot = (over: Partial<DirectusSlot> = {}): DirectusSlot => ({
  day_of_week: 0, start_time: '18:30:00', end_time: '20:00:00',
  label: 'BB - DU14', hall: { name: 'Rebhügel' }, ...over,
});

const linked = (...names: string[]) => names.map(name => ({ teams_id: { name } }));

// Every active basketball team in Directus as of 2026-08-08, as [name, group].
// The whole point of deriving the group is that this list keeps changing —
// these same teams have been through three renames already, and 2026/27 has two
// U18 girls' squads and no U16 girls' team at all.
const LIVE_TEAMS: Array<[string, string]> = [
  ['DU12', 'DU12'],
  ['DU14', 'DU14'],
  ['DU18 Fire', 'DU18'],
  ['DU18 Spark', 'DU18'],
  ['HU12', 'HU12'],
  ['HU14', 'HU14'],
  ['HU16', 'HU16'],
  ['HU18', 'HU18'],
  ['MU10', 'MU10'],
  ['MU8', 'MU8'],
  // Adults belong on no card at all.
  ['Damen D-Classics 1LR', ''],
  ['H-Classics 1LR', ''],
  ['Herren 1', ''],
  ['Herren 3 (Unicorns)', ''],
  ['Lions D1', ''],
  ['Rhinos D3', ''],
];

describe('youth basketball — card codes', () => {
  it('places every live team in the group the page actually renders', () => {
    for (const [name, code] of LIVE_TEAMS) {
      expect(cardCode(name), name).toBe(code);
    }
  });

  it('keeps both U18 girls squads in U18, whatever league they play', () => {
    // Fire plays the DU16B league (second squads play down) but is a U18 team.
    // Grouping by league put it on the U16 card and left U18 with one squad.
    expect(cardCode('DU18 Fire')).toBe('DU18');
    expect(cardCode('DU18 Spark')).toBe('DU18');
  });

  it('keeps a boys team out of the mixed group', () => {
    // HU12 plays the mixed MixU12M league; it is still the boys' team.
    expect(cardCode('HU12')).toBe('HU12');
  });

  it('survives the renames the club has already made three times', () => {
    expect(cardCode('DU16')).toBe('DU16');
    expect(cardCode('1xDU18')).toBe('DU18');
    expect(cardCode('2xDU18')).toBe('DU18');
  });

  it('reads the group out of any spelling of the name', () => {
    expect(cardCode(' mu8 ')).toBe('MU8');
    expect(cardCode('HU 18B')).toBe('HU18');
    expect(cardCode('du08')).toBe('DU8');
  });

  it('returns nothing for a team that belongs in no group', () => {
    expect(cardCode(null)).toBe('');
    expect(cardCode('Herren 2')).toBe('');
    expect(cardCode('Damen D-Classics 1LR')).toBe('');
  });

  it('keeps the youth-status.js mirror agreeing on every live team', () => {
    // Both copies are hand-written (one TS, one ES5), so compare behaviour
    // rather than source: run the browser regexes over the same fixtures.
    const js = readFileSync(resolve(__dirname, '../../public/js/youth-status.js'), 'utf8');
    const src = js.match(/var CODE_TOKEN =[\s\S]*?\n  \}\n/);
    expect(src, 'cardCode() not found in youth-status.js').toBeTruthy();
    const mirror = new Function(`${src![0]}; return cardCode;`)() as typeof cardCode;
    for (const [name, code] of LIVE_TEAMS) {
      expect(mirror(name), `mirror: ${name}`).toBe(code);
    }
  });
});

describe('youth basketball — card titles', () => {
  it('shows a Directus name that says more than the bare code', () => {
    // Both U18 squads sit in the same group; the name is what tells them apart.
    expect(cardTitle('DU18 Spark', 'DU18')).toBe('DU18 Spark');
    expect(cardTitle('DU18 Fire', 'DU18')).toBe('DU18 Fire');
  });

  it('keeps the page label when the name is just the code', () => {
    // "U8 Mixed" reads better than "MU8"; whitespace/case must not defeat it.
    expect(cardTitle('MU8', 'MU8')).toBeNull();
    expect(cardTitle(' hu16 ', 'HU16')).toBeNull();
    expect(cardTitle(null, 'DU14')).toBeNull();
  });

  it('keeps the youth-status.js mirror in agreement', () => {
    const js = readFileSync(resolve(__dirname, '../../public/js/youth-status.js'), 'utf8');
    const src = js.match(/function cardTitle\(name, code\) \{[\s\S]*?\n  \}\n/);
    expect(src, 'cardTitle() not found in youth-status.js').toBeTruthy();
    const mirror = new Function(`${src![0]}; return cardTitle;`)() as (n: unknown, c: string) => string;
    // The mirror returns '' where the TS returns null — same meaning.
    expect(mirror('DU18 Spark', 'DU18')).toBe('DU18 Spark');
    expect(mirror('MU8', 'MU8')).toBe('');
    expect(mirror(null, 'DU14')).toBe('');
  });
});

describe('youth basketball — waiting list', () => {
  const js = () => readFileSync(resolve(__dirname, '../../public/js/youth-status.js'), 'utf8');

  it('points at a real https form', () => {
    expect(DEFAULT_WAITLIST_URL).toMatch(/^https:\/\//);
  });

  it('keeps the youth-status.js mirror of the fallback URL in sync', () => {
    const m = js().match(/var DEFAULT_WAITLIST_URL =\s*'([^']+)'/);
    expect(m, 'DEFAULT_WAITLIST_URL not found in youth-status.js').toBeTruthy();
    expect(m![1]).toBe(DEFAULT_WAITLIST_URL);
  });

  it('only falls back for a team known to be closed, never for an unknown status', () => {
    // Guards the failure mode where a 403/network error on the open-status
    // fetch would otherwise mark every card "Team voll".
    expect(js()).toContain('o.open === false');
    expect(js()).not.toMatch(/if \(!w && !o\)/);
  });
});

describe('youth basketball — mixed teams split girls/boys', () => {
  // The split lives in two hand-written copies: the build-time card
  // (YouthMeta.astro) and the browser reconciliation (youth-status.js). The
  // .astro half can't be imported here, so the JS half is executed for real and
  // the .astro one is checked to offer the same four badges.
  const js = readFileSync(resolve(__dirname, '../../public/js/youth-status.js'), 'utf8');
  const block = js.match(/function splitByGender\([\s\S]*?function closedBadge\([\s\S]*?\n  \}\n/);
  expect(block, 'gender-split helpers not found in youth-status.js').toBeTruthy();
  const api = new Function(
    `${block![0]}; return { splitByGender: splitByGender, openBadge: openBadge, closedBadge: closedBadge };`,
  )() as {
    splitByGender: (o: { girls: boolean; boys: boolean }, code: string) => boolean
    openBadge: (o: { girls: boolean; boys: boolean }, code: string) => [string, string]
    closedBadge: (o: { girls: boolean; boys: boolean }, code: string) => [string, string] | null
  };
  const state = (girls: boolean, boys: boolean) => ({ girls, boys });

  it('offers the contact form to the gender it takes and the waiting list to the other', () => {
    expect(api.openBadge(state(true, false), 'MU10')[0]).toBe('bbTeamOpenGirls');
    expect(api.closedBadge(state(true, false), 'MU10')![0]).toBe('bbTeamFullBoys');

    expect(api.openBadge(state(false, true), 'MU10')[0]).toBe('bbTeamOpenBoys');
    expect(api.closedBadge(state(false, true), 'MU10')![0]).toBe('bbTeamFullGirls');
  });

  it('keeps one generic row when the team takes both, or has said nothing', () => {
    // Both off is the state every mixed team starts in — the card must look
    // exactly as it did before the toggles existed.
    for (const s of [state(true, true), state(false, false)]) {
      expect(api.openBadge(s, 'MU8')[0]).toBe('bbTeamOpen');
      expect(api.closedBadge(s, 'MU8')).toBeNull();
    }
  });

  it('never splits a single-gender team, whatever the flags say', () => {
    expect(api.splitByGender(state(true, false), 'DU18')).toBe(false);
    expect(api.openBadge(state(true, false), 'DU18')[0]).toBe('bbTeamOpenF');
    expect(api.closedBadge(state(true, false), 'DU18')).toBeNull();
    expect(api.openBadge(state(false, true), 'HU18')[0]).toBe('bbTeamOpen');
    expect(api.closedBadge(state(false, true), 'HU18')).toBeNull();
  });

  it('renders the same four badges at build time, and all of them translate', () => {
    const astro = readFileSync(resolve(__dirname, '../../src/components/YouthMeta.astro'), 'utf8');
    const de = JSON.parse(readFileSync(resolve(__dirname, '../../public/js/i18n/de.json'), 'utf8'));
    for (const key of ['bbTeamOpenGirls', 'bbTeamOpenBoys', 'bbTeamFullGirls', 'bbTeamFullBoys']) {
      expect(astro, `${key} missing from YouthMeta.astro`).toContain(key);
      expect(js, `${key} missing from youth-status.js`).toContain(key);
      expect(de, `${key} missing from de.json`).toHaveProperty(key);
    }
  });
});

describe('youth basketball — slot validity', () => {
  const today = '2026-08-08';

  it('drops slots whose season has already ended', () => {
    // The 2025/26 basketball plan — still in hall_slots, no longer on the page.
    expect(isCurrentOrUpcoming({ valid_until: '2026-06-27', indefinite: false }, today)).toBe(false);
  });

  it('keeps slots that are still running, including the last valid day', () => {
    expect(isCurrentOrUpcoming({ valid_until: '2026-08-16', indefinite: false }, today)).toBe(true);
    expect(isCurrentOrUpcoming({ valid_until: today, indefinite: false }, today)).toBe(true);
  });

  it('keeps indefinite slots regardless of their placeholder end date', () => {
    expect(isCurrentOrUpcoming({ valid_until: '2020-01-01', indefinite: true }, today)).toBe(true);
    expect(isCurrentOrUpcoming({ valid_until: null, indefinite: null }, today)).toBe(true);
  });

  it('keeps a season that has not started yet', () => {
    // Deliberate: the new plan should be readable before its first week.
    expect(isCurrentOrUpcoming({ valid_until: '2027-08-17', indefinite: true }, today)).toBe(true);
  });
});

describe('youth basketball — slot → team matching', () => {
  it('resolves to the exact linked team, not an age group', () => {
    // "BB - DU18" cannot say WHICH U18 girls squad; the link can, and must —
    // otherwise both squads inherit each other's training times.
    const t = slotTargets(slot({ label: 'BB - DU18', teams: linked('DU18 Fire') }));
    expect(t).toEqual({ names: ['DU18 Fire'], codes: [] });
  });

  it('keeps slots whose label matches no age group at all', () => {
    // The Friday extra session — dropped entirely by the old label parsing.
    const t = slotTargets(slot({ label: 'BB - U14-U18+', teams: linked('HU16') }));
    expect(t.names).toEqual(['HU16']);
  });

  it('spreads a shared session across every linked team', () => {
    const t = slotTargets(slot({ label: 'BB - MU8/MU10', teams: linked('MU8', 'MU10') }));
    expect(t.names.sort()).toEqual(['MU10', 'MU8']);
  });

  it('falls back to the label when a slot carries no team link', () => {
    // Then it can only name an age group, so every team in it gets the line.
    expect(slotTargets(slot({ label: 'BB - HU14', teams: [] }))).toEqual({ names: [], codes: ['HU14'] });
    expect(slotTargets(slot({ label: 'BB - H3', teams: null }))).toEqual({ names: [], codes: [] });
  });
});

describe('youth basketball — slot list', () => {
  const s = (day: number, start: string, end: string, hall: string, validUntil?: string): YouthSlot =>
    ({ day, start, end, hall, ...(validUntil ? { validUntil } : {}) });

  it('collapses one session booked across two halls into a single line', () => {
    // DU12 trains in Borrweg 1 + 2 at the same time; the card shows no hall.
    const out = dedupeSlots([s(0, '17:30', '19:00', 'Borrweg 1'), s(0, '17:30', '19:00', 'Borrweg 2')]);
    expect(out).toHaveLength(1);
  });

  it('keeps the longest-lived row when a duplicate expires earlier', () => {
    // An expiring booking next to its open-ended replacement must not make the
    // line disappear on the older end date.
    const out = dedupeSlots([
      s(0, '18:30', '20:00', 'Rebhügel', '2026-08-16'),
      s(0, '18:30', '20:00', 'Rebhügel'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].validUntil).toBeUndefined();
  });

  it('keeps the later end date when both duplicates expire', () => {
    const out = dedupeSlots([
      s(0, '18:30', '20:00', 'KWI A', '2026-06-27'),
      s(0, '18:30', '20:00', 'KWI B', '2027-06-27'),
    ]);
    expect(out[0].validUntil).toBe('2027-06-27');
  });

  it('keeps genuinely different sessions and sorts them by weekday then time', () => {
    const out = dedupeSlots([s(2, '17:30', '19:00', 'Rebhügel'), s(0, '18:30', '20:00', 'Rebhügel')]);
    expect(out.map(x => `${x.day} ${x.start}`)).toEqual(['0 18:30', '2 17:30']);
  });

  it('keeps two sessions on the same day at different times', () => {
    const out = dedupeSlots([s(3, '18:00', '19:30', 'KWI A'), s(3, '20:00', '21:30', 'KWI C')]);
    expect(out).toHaveLength(2);
  });
});

describe('youth basketball — expiry survives without a rebuild', () => {
  // Training lines are built statically and the auto-rebuild Flow only fires on
  // Directus content edits, so a booking reaching its end date is dropped in the
  // browser instead. That needs both halves of the contract to stay in place.
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

  it('the card renders each slot end date as data-valid-until', () => {
    expect(read('src/components/YouthMeta.astro')).toContain('data-valid-until={s.validUntil}');
  });

  it('the runtime prunes slot lines whose end date has passed', () => {
    const js = read('public/js/youth-status.js');
    expect(js).toContain('.youth-slot[data-valid-until]');
    // Compared against today, and the dangling label is cleaned up with them.
    expect(js).toMatch(/getAttribute\('data-valid-until'\)\s*<\s*today/);
    expect(js).toContain('youth-meta-label');
  });
});
