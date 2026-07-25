import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The ClubDesk export is a positional contract: ClubDesk maps columns by ORDER, so a
// header added, removed or reordered without the matching change to the row shifts
// every field after it — surname into Vorname, street into PLZ — and the import lands
// wrong for the whole file. Nothing else asserts this, and the failure is silent: the
// CSV is still well-formed, just wrong. So the check is against the shipped source.
const SRC = readFileSync('src/pages/admin.astro', 'utf8');

function exportCsvSection(): string {
  const i = SRC.indexOf('function exportCSV(items)');
  expect(i, 'exportCSV not found').toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('.map(csvEscape)', i));
}

function headerNames(): string[] {
  const seg = exportCsvSection();
  const h = seg.slice(seg.indexOf('var headers = ['));
  return [...h.slice(0, h.indexOf('];') + 1).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

// Split the emitted row literal on top-level commas. Line comments are stripped first:
// each sits *after* the comma it follows, so splitting first attaches every comment to
// the next value and makes the list look one longer than it is.
function rowValues(): string[] {
  const seg = exportCsvSection();
  const r = seg.slice(seg.lastIndexOf('return ['));
  const body = r
    .slice('return ['.length, r.lastIndexOf(']'))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function loadCsvSafe(): (v: unknown) => string {
  const start = SRC.indexOf('function csvSafe(val)');
  expect(start, 'csvSafe not found').toBeGreaterThan(-1);
  const end = SRC.indexOf('\n    }', start) + '\n    }'.length;
  return new Function(`${SRC.slice(start, end)}\nreturn csvSafe;`)();
}

describe('ClubDesk CSV export', () => {
  it('emits exactly one value per header, in the same order', () => {
    const headers = headerNames();
    const values = rowValues();
    expect(headers.length, 'header count changed').toBe(54);
    expect(
      values.length,
      `row emits ${values.length} values for ${headers.length} headers — ClubDesk maps by position, so everything after the mismatch imports into the wrong column`,
    ).toBe(headers.length);
  });

  it('keeps the ClubDesk column order frozen', () => {
    // ClubDesk's own import layout. Changing this list means the club's import
    // template changed too — update both together, deliberately.
    expect(headerNames()).toEqual([
      'Nachname', 'Vorname', 'Firma', 'Adresse', 'PLZ', 'Ort',
      'Telefon Privat', 'Telefon Mobil', '[Gruppen]', 'Sektion', 'Gruppe', 'Gruppen',
      'Anrede', 'Titel', 'Briefanrede', 'Benutzer-Id', 'Adress-Zusatz', 'Land',
      'Nationalität', 'Telefon Geschäft', 'Fax', 'E-Mail', 'E-Mail Alternativ',
      'Status', '[Rolle]', 'Eintritt', 'Mitgliedsjahre', 'Austritt', 'Zivilstand',
      'Geschlecht', 'Geburtsdatum', 'Jahrgang', 'Alter', 'Bemerkungen',
      'Firmen-Webseite', 'Rechnungsversand', 'Nie mahnen', 'IBAN', 'BIC', 'Kontoinhaber',
      'Lizenznummer', 'Lizenzart', 'Lizenz bestellt', 'Beitragskategorie',
      'Betrag Bezahlt', 'Clubnummer', 'Mittelschule ZH', 'Offiziellen Lizenz',
      'Mitgliederbeitrag', 'AHV Nummer', 'Passivmitglied', 'Offiziellen 100er',
      'Funktion', 'Rolle',
    ]);
  });

  it('puts identity fields where ClubDesk expects them', () => {
    const headers = headerNames();
    const values = rowValues();
    const at = (name: string) => values[headers.indexOf(name)];
    expect(at('Nachname')).toContain('item.nachname');
    expect(at('Vorname')).toContain('item.vorname');
    expect(at('Adresse')).toContain('item.adresse');
    expect(at('PLZ')).toContain('item.plz');
    expect(at('Ort')).toContain('item.ort');
    expect(at('E-Mail')).toContain('item.email');
    expect(at('Geburtsdatum')).toContain('dob');
  });

  it('writes a UTF-8 BOM and semicolon separator', () => {
    const seg = exportCsvSection();
    // Without the BOM, Excel reads the UTF-8 as latin-1 and Dürig becomes DÃ¼rig.
    expect(SRC.slice(SRC.indexOf('function exportCSV(items)'))).toMatch(/'\\uFEFF'|'\uFEFF'/);
    expect(seg + SRC.slice(SRC.indexOf('.map(csvEscape)'), SRC.indexOf('.map(csvEscape)') + 400))
      .toContain("join(';')");
  });

  it('neutralises spreadsheet formula injection', () => {
    const csvSafe = loadCsvSafe();
    // A member could put =HYPERLINK(...) or a DDE payload in a free-text field; the
    // admin opening the export in Excel must not execute it.
    for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvSafe(payload), `${JSON.stringify(payload)} not neutralised`).toBe(
        `"'${payload.replace(/"/g, '""')}"`,
      );
    }
  });

  it('escapes quotes and leaves ordinary values intact', () => {
    const csvSafe = loadCsvSafe();
    expect(csvSafe('Müller')).toBe('"Müller"');
    expect(csvSafe('a"b')).toBe('"a""b"');
    expect(csvSafe(null)).toBe('""');
    expect(csvSafe(undefined)).toBe('""');
  });
});
