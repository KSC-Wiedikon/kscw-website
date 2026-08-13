import { describe, it, expect } from 'vitest';
import { getBadgeText } from '../../src/data/teams';

/**
 * Basketball league codes used to fall through `getBadgeText` untouched, so team
 * cards and hero badges printed "H3LS" and "D1LRA" at the visitor. The helper only
 * knew volleyball's shapes.
 */
describe('getBadgeText — basketball federation codes', () => {
  it('reads the league number out of a ProBasket code', () => {
    expect(getBadgeText('H1LRA', 'Herren 1')).toBe('1. Liga');
    expect(getBadgeText('H3LS', 'Herren 2')).toBe('3. Liga');
    expect(getBadgeText('H4LZ', 'Herren 3 (Unicorns)')).toBe('4. Liga');
    expect(getBadgeText('D1LRA', 'Lions D1')).toBe('1. Liga');
    expect(getBadgeText('D3LR', 'Rhinos D3')).toBe('3. Liga');
  });

  it('names the veterans category', () => {
    expect(getBadgeText('H-Classics', 'H-Classics 1LR')).toBe('Classics');
    expect(getBadgeText('D-Classics', 'Damen D-Classics 1LR')).toBe('Classics');
  });

  it('still prefers the U-level from the team name for youth teams', () => {
    // The youth codes are the reason the adult pattern is anchored and digit-strict.
    expect(getBadgeText('DU12Tu', 'DU12')).toBe('U12');
    expect(getBadgeText('MixU10M', 'MU10')).toBe('U10');
    expect(getBadgeText('HU 18B', 'HU18')).toBe('U18');
    expect(getBadgeText('DU16B', 'DU18 Fire')).toBe('U18');
  });

  it('leaves volleyball behaviour untouched', () => {
    expect(getBadgeText('2L', 'D1')).toBe('2. Liga');
    expect(getBadgeText('Herren 2. Liga', 'H2')).toBe('2. Liga');
    expect(getBadgeText('', 'Legends')).toBe('');
  });
});
