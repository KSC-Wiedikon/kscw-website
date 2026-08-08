import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_WAITLIST_URL, TEAM_CODE_ALIASES, cardCode, codesForSlot, dedupeSlots,
  isCurrentOrUpcoming, type DirectusSlot, type YouthSlot,
} from 'src/lib/fetch/youthBasketball';

const slot = (over: Partial<DirectusSlot> = {}): DirectusSlot => ({
  day_of_week: 0, start_time: '18:30:00', end_time: '20:00:00',
  label: 'BB - DU14', hall: { name: 'Rebhügel' }, ...over,
});

const linked = (...names: string[]) => names.map(n => ({ teams_id: { name: n } }));

describe('youth basketball — card codes', () => {
  it('maps the renamed girls teams onto the cards the page actually renders', () => {
    // 1xDU18 = U18 girls, 2xDU18 = second squad playing the DU16B league.
    expect(cardCode('1xDU18')).toBe('DU18');
    expect(cardCode('2xDU18')).toBe('DU16');
  });

  it('passes through every other team name, upper-cased and trimmed', () => {
    expect(cardCode('HU16')).toBe('HU16');
    expect(cardCode(' mu8 ')).toBe('MU8');
    expect(cardCode(null)).toBe('');
  });

  it('keeps the youth-status.js mirror of the alias map in sync', () => {
    const js = readFileSync(resolve(__dirname, '../../public/js/youth-status.js'), 'utf8');
    const block = js.match(/var TEAM_CODE_ALIASES = \{([\s\S]*?)\};/);
    expect(block, 'TEAM_CODE_ALIASES block not found in youth-status.js').toBeTruthy();
    const mirror: Record<string, string> = {};
    for (const [, k, v] of block![1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) mirror[k] = v;
    expect(mirror).toEqual(TEAM_CODE_ALIASES);
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

describe('youth basketball — slot → card matching', () => {
  it('uses the team link, not the label', () => {
    // "BB - 2xDU18" parses to DU18 by label; the team link puts it on DU16.
    expect(codesForSlot(slot({ label: 'BB - 2xDU18', teams: linked('2xDU18') }))).toEqual(['DU16']);
  });

  it('keeps slots whose label matches no age group at all', () => {
    // The Friday extra session — dropped entirely by the old label parsing.
    expect(codesForSlot(slot({ label: 'BB - U14-U18+', teams: linked('HU16') }))).toEqual(['HU16']);
  });

  it('spreads a shared session across every linked team', () => {
    const codes = codesForSlot(slot({ label: 'BB - MU8/MU10', teams: linked('MU8', 'MU10') }));
    expect(codes.sort()).toEqual(['MU10', 'MU8']);
  });

  it('falls back to the label when a slot carries no team link', () => {
    expect(codesForSlot(slot({ label: 'BB - HU14', teams: [] }))).toEqual(['HU14']);
    expect(codesForSlot(slot({ label: 'BB - H3', teams: null }))).toEqual([]);
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
