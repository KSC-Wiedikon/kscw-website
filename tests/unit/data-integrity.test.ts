import { describe, it, expect } from 'vitest';
import boardMembers from '../../src/data/board-members.json';
import contactPersons from '../../src/data/contact-persons.json';
import contactAddresses from '../../src/data/contact-addresses.json';
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';
import { allTeamDefs } from '../../src/data/teams';

describe('board-members.json', () => {
  it('has at least one entry', () => {
    expect(boardMembers.length).toBeGreaterThan(0);
  });

  it('every entry has required fields', () => {
    for (const member of boardMembers) {
      expect(member.name, `Missing name`).toBeTruthy();
      expect(member.initials, `Missing initials for ${member.name}`).toBeTruthy();
      expect(member.role_de, `Missing role_de for ${member.name}`).toBeTruthy();
      expect(member.role_en, `Missing role_en for ${member.name}`).toBeTruthy();
      expect(['president', 'vice', 'ressort']).toContain(member.tier);
      expect(typeof member.tier_order, `Invalid tier_order for ${member.name}`).toBe('number');
    }
  });

  it('has exactly one president and one vice', () => {
    const tiers = boardMembers.map(m => m.tier);
    expect(tiers.filter(t => t === 'president').length).toBe(1);
    expect(tiers.filter(t => t === 'vice').length).toBe(1);
  });
});

describe('contact-persons.json', () => {
  it('has at least one entry', () => {
    expect(contactPersons.length).toBeGreaterThan(0);
  });

  it('every entry has required fields', () => {
    for (const person of contactPersons) {
      expect(person.name, `Missing name`).toBeTruthy();
      // Names only — the page publishes role addresses (contact-addresses.json),
      // never a person's own address.
      expect((person as Record<string, unknown>).email, `${person.name} must not carry an email`).toBeUndefined();
      expect(person.sport, `Missing sport for ${person.name}`).toBeTruthy();
      expect(typeof person.order, `Invalid order for ${person.name}`).toBe('number');
    }
  });
});

describe('teams.ts', () => {
  it('has at least one team', () => {
    expect(allTeamDefs.length).toBeGreaterThan(0);
  });

  it('every team has required fields', () => {
    for (const team of allTeamDefs) {
      // directusId may be empty for website-only teams not yet in Directus
      expect(typeof team.directusId, `Invalid directusId type for ${team.displayName}`).toBe('string');
      expect(team.slug, `Missing slug for ${team.displayName}`).toBeTruthy();
      expect(team.sport, `Missing sport for ${team.displayName}`).toBeTruthy();
      expect(team.displayName, `Missing displayName`).toBeTruthy();
      expect(team.category, `Missing category for ${team.displayName}`).toBeTruthy();
      expect(['volleyball', 'basketball']).toContain(team.sport);
      expect(['men', 'women', 'youth']).toContain(team.category);
    }
  });

  it('no duplicate slugs within the same sport', () => {
    const seen = new Map<string, string>();
    for (const team of allTeamDefs) {
      const key = `${team.sport}:${team.slug}`;
      expect(seen.has(key), `Duplicate slug "${team.slug}" in ${team.sport}: ${seen.get(key)} and ${team.displayName}`).toBe(false);
      seen.set(key, team.displayName);
    }
  });
});

describe('contact-addresses.json', () => {
  const sections = ['club', 'volleyball', 'basketball'] as const;

  it('every section lists at least one address', () => {
    for (const s of sections) expect(contactAddresses[s].length, s).toBeGreaterThan(0);
  });

  it('publishes only kscw.ch role addresses, each with a DE + EN label', () => {
    const dicts = { de, en } as Record<string, Record<string, string>>;
    for (const s of sections) {
      for (const a of contactAddresses[s]) {
        expect(a.address, `${s}: ${a.address}`).toMatch(/^[a-z0-9._-]+@([a-z0-9-]+\.)*kscw\.ch$/);
        for (const lang of ['de', 'en']) {
          expect(dicts[lang][a.labelKey], `${lang} label ${a.labelKey}`).toBeTruthy();
        }
      }
    }
  });
});
