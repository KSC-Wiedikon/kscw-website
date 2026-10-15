/**
 * wiedisync migration 420 renamed events.event_type verein → club and
 * trainingsweekend → training_weekend. /kscw/public/events still answers the
 * old spelling until wiedisync drops eventTypeToLegacy, so the site accepts both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeEventType } from '../../src/lib/fetch/events';

describe('event_type — English values, legacy spelling still accepted', () => {
  it('maps the legacy spelling to the English one', () => {
    expect(normalizeEventType('verein')).toBe('club');
    expect(normalizeEventType('trainingsweekend')).toBe('training_weekend');
  });

  it('passes English and unknown values through, defaults to other', () => {
    for (const v of ['club', 'training_weekend', 'social', 'tournament', 'camp']) {
      expect(normalizeEventType(v)).toBe(v);
    }
    expect(normalizeEventType(null)).toBe('other');
  });

  it('the home page labels a club event with either spelling', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf8');
    expect(src).toContain("['club', 'verein'].includes(ev.category) ? t(locale, 'eventCategoryClub')");
  });

  it('the admin writes English event types', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/admin.astro'), 'utf8');
    expect(src).toContain("var EVENT_TYPES = ['club', 'social', 'meeting', 'tournament', 'training_weekend', 'friendly', 'other'];");
    expect(src).toContain("item ? item.event_type : 'club', eventTypeLabel)");
    expect(src).not.toMatch(/'trainingsweekend'|: 'verein'\)/);
  });
});
