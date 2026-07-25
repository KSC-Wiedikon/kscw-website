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

  it('encodes Windows-1252 with no BOM, semicolon-separated', () => {
    const seg = exportCsvSection();
    const tail = SRC.slice(SRC.indexOf('.map(csvEscape)'), SRC.indexOf('.map(csvEscape)') + 1200);
    expect(seg + tail).toContain("join(';')");
    // ClubDesk's CSV interface is CP1252, not UTF-8 — its own export is CP1252 and
    // the scripted sync-up transcodes before upload. A UTF-8 attachment mangles
    // every accented name in the member register (Dürig → DÃ¼rig).
    expect(tail).toContain('toCp1252Bytes(csv)');
    expect(tail).toContain('charset=windows-1252');
    // A BOM would leave the first header reading "ï»¿Nachname" and fail to map.
    expect(tail).not.toContain('\uFEFF');
  });

  it('transliterates what CP1252 cannot hold, byte for byte', () => {
    // The CP1252 table and the transliteration table are shared with pdfSafe, so
    // the encoder needs both that block and the function itself.
    const ts = SRC.indexOf('var CP1252_EXTRA');
    expect(ts, 'CP1252 table not found').toBeGreaterThan(-1);
    const te = SRC.indexOf('\n    }', SRC.indexOf('function pdfSafe')) + '\n    }'.length;
    const cs = SRC.indexOf('function toCp1252Bytes');
    expect(cs, 'toCp1252Bytes not found').toBeGreaterThan(-1);
    const ce = SRC.indexOf('\n    }', cs) + '\n    }'.length;
    const enc = new Function(
      `${SRC.slice(ts, te)}\n${SRC.slice(cs, ce)}\nreturn toCp1252Bytes;`,
    )() as (s: string) => Uint8Array;
    const bytes = (s: string) => Array.from(enc(s));

    // Latin-1 range survives as single bytes — the whole point of CP1252 here.
    expect(bytes('Dürig')).toEqual([0x44, 0xFC, 0x72, 0x69, 0x67]);
    expect(bytes('Müller')).toEqual([0x4D, 0xFC, 0x6C, 0x6C, 0x65, 0x72]);
    // CP1252-only slots (Š, ž) keep their own byte rather than being folded.
    expect(bytes('Š')).toEqual([0x8A]);
    expect(bytes('ž')).toEqual([0x9E]);
    // No CP1252 slot → lose the diacritic, matching wiedisync's sync-up so both
    // writers put the same spelling into the register.
    expect(String.fromCharCode(...bytes('Šarčević'))).toBe('\u008Aarcevic');
    expect(String.fromCharCode(...bytes('Łukasz'))).toBe('Lukasz');
    expect(String.fromCharCode(...bytes('Đoković'))).toBe('Dokovic');
    // Letters with no CP1252 slot and no decomposition are named in the shared
    // table, so they resolve rather than becoming '?' in the member register.
    expect(String.fromCharCode(...bytes('Işık'))).toBe('Isik');
    expect(String.fromCharCode(...bytes('Altınbaş'))).toBe('Altinbas');
    // Nothing Latin to fall back on → '?', never a broken byte.
    expect(bytes('北京')).toEqual([0x3F, 0x3F]);
    // Every byte must be a single octet — a stray >0xFF would corrupt the file.
    for (const b of bytes('Dürig Šarčević Łukasz 北京 €')) {
      expect(b).toBeLessThanOrEqual(0xFF);
      expect(b).toBeGreaterThanOrEqual(0);
    }
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
