import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

// The .xlsx writer lives inside admin.astro's `is:inline` script, so it cannot be
// imported. Extract and eval the shipped source instead of copying it — a copy
// would drift, and the whole point of this test is the raw zip byte layout (the
// local-file-header and central-directory field offsets differ by 2 bytes, which
// is easy to get wrong and produces a file no reader will open).
const SRC = readFileSync('src/pages/admin.astro', 'utf8');
const START = 'var CRC_TABLE = null;';
const END = "'schreiberkurs-teilnehmerliste-' + nameBase + '.xlsx');";

function loadWriter() {
  const start = SRC.indexOf(START);
  const end = SRC.indexOf(END);
  expect(start, 'xlsx writer start marker missing').toBeGreaterThan(-1);
  expect(end, 'xlsx writer end marker missing').toBeGreaterThan(-1);
  const code = SRC.slice(start, end + END.length) + '\n}\n';
  let captured: { blob: Blob; name: string } | null = null;
  const factory = new Function('downloadBlob',
    `${code}\nreturn { exportSvrzXLSX, splitSwissAddress, safeFileName, zipStore, colName, xmlEsc,`
    + ` SVRZ_HEADERS, svrzColWidths, approxWidth, SVRZ_COL_MIN, SVRZ_COL_MAX };`);
  const api = factory((blob: Blob, name: string) => { captured = { blob, name }; });
  return {
    ...api,
    async build(rows: unknown[][], expert?: string) {
      captured = null;
      api.exportSvrzXLSX('test', rows, expert);
      if (!captured) throw new Error('exportSvrzXLSX did not produce a download');
      const { blob, name } = captured as { blob: Blob; name: string };
      return { name, type: blob.type, bytes: Buffer.from(await blob.arrayBuffer()) };
    },
  };
}

/** Minimal STORE-only zip reader — walks the central directory, so it fails loudly
 *  on wrong offsets/sizes, and CRC-checks every part against node's zlib. Returns
 *  raw bytes: decoding here would hide exactly the binary corruption we check for. */
function readZip(buf: Buffer): Record<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd, 'no end-of-central-directory record').toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(ptr), 'bad central directory signature').toBe(0x02014b50);
    const method = buf.readUInt16LE(ptr + 10);
    const storedCrc = buf.readUInt32LE(ptr + 16);
    const size = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const local = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    expect(method, `${name}: expected STORE`).toBe(0);

    expect(buf.readUInt32LE(local), `${name}: bad local header signature`).toBe(0x04034b50);
    expect(buf.readUInt32LE(local + 14), `${name}: local CRC mismatch`).toBe(storedCrc);
    expect(buf.readUInt32LE(local + 22), `${name}: local size mismatch`).toBe(size);
    const localNameLen = buf.readUInt16LE(local + 26);
    const extraLen = buf.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + size);
    expect(crc32(data), `${name}: CRC does not match its bytes`).toBe(storedCrc);
    out[name] = Buffer.from(data);
    ptr += 46 + nameLen + buf.readUInt16LE(ptr + 30) + buf.readUInt16LE(ptr + 32);
  }
  return out;
}

/** The worksheet part of a freshly built workbook, as text. */
function sheetOf(parts: Record<string, Buffer>): string {
  return parts['xl/worksheets/sheet1.xml'].toString('utf8');
}

// One entry per SVRZ column: Kursdatum, Prüfungsdatum, Prüfungsresultat, Vereinsname,
// Lizenz-Nr., Name, Vorname, Strasse, PLZ, Wohnort, Telefon, E-Mail, Geb. Datum.
const ROWS = [
  ['19.08.2026', '20.08.2026', 'Bestanden', 'KSC Wiedikon', '337646', 'Dürig <&"> 🏐', 'Melina',
    'Bahnhofstrasse 1', '8001', 'Zürich', '079 123 45 67', 'melina@example.ch', '07.02.1999'],
  ['19.08.2026', '', '', 'VBC Spada', '', 'Rossi', 'Davide',
    'Seestrasse 12', '8002', 'Zürich', '', 'davide@example.ch', '14.11.2001'],
];

describe('admin .xlsx export (SVRZ Teilnehmerliste)', () => {
  it('produces a readable zip: every part CRC-checks and the offsets resolve', async () => {
    const { build } = loadWriter();
    const { name, type, bytes } = await build(ROWS, 'Anne Muster');
    expect(name).toBe('schreiberkurs-teilnehmerliste-test.xlsx');
    expect(type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // "PK\3\4"

    const parts = readZip(bytes); // throws/fails on any bad offset, size or CRC
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels',
      'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ]);
  });

  it('reproduces the SVRZ letterhead, header row and hint row verbatim', async () => {
    const { build, SVRZ_HEADERS } = loadWriter();
    const sheet = sheetOf(readZip((await build(ROWS, 'Anne Muster')).bytes));
    expect(sheet).toContain('Schreiberwesen');
    expect(sheet).toContain('RSK Swiss Volley Region Zürich');
    expect(sheet).toContain('Schreiberkurs Teilnehmerliste');
    expect(sheet).toContain('Schreiberexperte: Anne Muster');
    expect(sheet).toContain('Bestanden / Nicht bestanden');
    expect(sheet).toContain('Bitte vollständig ausfüllen');
    // SVRZ transcribes by column position — a reordered header breaks their read.
    expect(SVRZ_HEADERS).toEqual(['Kursdatum', 'Prüfungsdatum', 'Prüfungsresultat', 'Vereinsname',
      'Lizenz-Nr.', 'Name', 'Vorname', 'Strasse', 'PLZ', 'Wohnort', 'Telefon', 'E-Mail', 'Geb. Datum']);
    SVRZ_HEADERS.forEach((h: string, i: number) => {
      const col = String.fromCharCode(65 + i);
      expect(sheet, `${h} must sit in column ${col} of row 7`)
        .toMatch(new RegExp(`<c r="${col}7" s="7"[^>]*><is><t[^>]*>${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
    });
    expect(sheet).toContain('<mergeCell ref="A5:M5"/>'); // expert line spans the sheet
    expect(sheet).toContain('<mergeCell ref="E8:M8"/>');
  });

  it('writes data from row 9 down, banded, with dates as Swiss text', async () => {
    const { build } = loadWriter();
    const sheet = sheetOf(readZip((await build(ROWS)).bytes));
    // Dates stay text: a serial + numFmt would render dd/mm/yyyy in Excel, which is
    // exactly the slashed format the platform forbids.
    expect(sheet).toMatch(/<c r="A9" s="9"[^>]*><is><t[^>]*>19\.08\.2026</);
    expect(sheet).toMatch(/<c r="C9" s="9"[^>]*><is><t[^>]*>Bestanden</);
    expect(sheet).toMatch(/<c r="D9" s="10"[^>]*><is><t[^>]*>KSC Wiedikon</);
    expect(sheet).toMatch(/<c r="A10" s="11"/); // second row drops the band fill
    expect(sheet).toMatch(/<c r="D10" s="12"/);
    // Unlike a plain table writer, empty cells are still emitted — they carry the box border.
    expect(sheet).toContain('<c r="B10" s="11"/>');
    expect(sheet).toContain('state="frozen"');
  });

  it('leaves the expert line bare when no expert is known', async () => {
    const { build } = loadWriter();
    const sheet = sheetOf(readZip((await build(ROWS)).bytes));
    expect(sheet).toContain('Schreiberexperte:');
    expect(sheet).not.toContain('Schreiberexperte: ');
  });

  it('escapes XML metacharacters rather than emitting broken markup', async () => {
    const { build, xmlEsc } = loadWriter();
    const sheet = sheetOf(readZip((await build(ROWS)).bytes));
    expect(sheet).toContain('Dürig &lt;&amp;&quot;&gt; 🏐');
    expect(xmlEsc(`a${String.fromCharCode(7)}b`)).toBe('ab'); // control chars are illegal in XML 1.0
  });

  it('handles a course with no signups', async () => {
    const { build } = loadWriter();
    const sheet = sheetOf(readZip((await build([])).bytes));
    expect(sheet).toContain('Schreiberkurs Teilnehmerliste'); // blank form, still valid
    expect(sheet).not.toContain('r="A9"');
  });
});

// Widths are the difference between a list SVRZ can read and one where the long
// half of every address is behind the next column. Excel does not autofit on
// open, so whatever is written here is what they see.
describe('column widths', () => {
  /** width of column `c` for these rows, by header name. */
  function widthOf(rows: string[][], header: string): number {
    const { svrzColWidths, SVRZ_HEADERS } = loadWriter();
    return svrzColWidths(rows)[SVRZ_HEADERS.indexOf(header)];
  }

  it('fits every header on its own row', () => {
    const { svrzColWidths, approxWidth, SVRZ_HEADERS } = loadWriter();
    svrzColWidths(ROWS).forEach((w: number, i: number) => {
      expect(w, `${SVRZ_HEADERS[i]} is narrower than its own heading`)
        .toBeGreaterThanOrEqual(approxWidth(SVRZ_HEADERS[i], true));
    });
  });

  it('grows a column to its longest value', () => {
    const long = ROWS.map((r) => r.slice());
    long[0][11] = 'anna.katharina.muellerwidmermatt@bluewin.ch';
    expect(widthOf(long, 'E-Mail')).toBeGreaterThan(widthOf(ROWS, 'E-Mail'));
    // …and only that column: a long e-mail must not push the date columns out.
    expect(widthOf(long, 'Kursdatum')).toBe(widthOf(ROWS, 'Kursdatum'));
  });

  it('measures the header and data rows only, not the letterhead or the expert band', () => {
    // "RSK Swiss Volley Region Zürich" sits in M1 and "Schreiberexperte: …" spans
    // A5:M5. Sizing a column to either would make one column as wide as a sentence.
    const { svrzColWidths, SVRZ_HEADERS } = loadWriter();
    const w = svrzColWidths(ROWS);
    expect(w[SVRZ_HEADERS.indexOf('Geb. Datum')]).toBeLessThan(20);
    expect(w[SVRZ_HEADERS.indexOf('Kursdatum')]).toBeLessThan(20);
  });

  it('clamps: a runaway value cannot produce a column nothing fits beside', () => {
    const { SVRZ_COL_MIN, SVRZ_COL_MAX } = loadWriter();
    const wide = ROWS.map((r) => r.slice());
    wide[0][7] = 'x'.repeat(400);
    expect(widthOf(wide, 'Strasse')).toBe(SVRZ_COL_MAX);
    // An empty course still gets a usable form rather than hairline columns.
    const { svrzColWidths } = loadWriter();
    svrzColWidths([]).forEach((v: number) => expect(v).toBeGreaterThanOrEqual(SVRZ_COL_MIN));
  });

  it('writes one sized <col> per column into the sheet', async () => {
    const { build, svrzColWidths } = loadWriter();
    const sheet = sheetOf(readZip((await build(ROWS)).bytes));
    svrzColWidths(ROWS).forEach((w: number, i: number) => {
      expect(sheet).toContain(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"`);
    });
  });
});

describe('splitSwissAddress', () => {
  it.each([
    ['Bahnhofstrasse 1, 8001 Zürich', { street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich' }],
    ['Seestrasse 12 8002 Zürich', { street: 'Seestrasse 12', zip: '8002', city: 'Zürich' }], // no comma
    ['Im Grüene 3, 8055 Zürich Wiedikon', { street: 'Im Grüene 3', zip: '8055', city: 'Zürich Wiedikon' }],
    ['Hauptstr. 5, 79539 Lörrach', { street: 'Hauptstr. 5', zip: '79539', city: 'Lörrach' }], // 5-digit DE
    ['  Bahnhofstrasse   1 ,  8001   Zürich ', { street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich' }],
  ] as Array<[string, { street: string; zip: string; city: string }]>)('splits %s', (input, expected) => {
    expect(loadWriter().splitSwissAddress(input)).toEqual(expected);
  });

  // A wrong guess would put a house number in the PLZ column of an official list,
  // so anything not matching the postcode shape stays whole in Strasse.
  it.each([
    'Bahnhofstrasse 1',
    '8001 Zürich',
    'Bahnhofstrasse 1, 8001 Zürich, Schweiz',
  ])('falls back to the street column for %s', (input) => {
    const got = loadWriter().splitSwissAddress(input);
    expect(got.zip).toBe('');
    expect(got.city).toBe('');
    expect(got.street).toBe(input.trim().replace(/\s+/g, ' '));
  });

  it('returns empty parts for a missing address', () => {
    expect(loadWriter().splitSwissAddress('')).toEqual({ street: '', zip: '', city: '' });
    expect(loadWriter().splitSwissAddress(null)).toEqual({ street: '', zip: '', city: '' });
  });
});

// A participant with no licence yet answers the form's number field with zeros.
// On the list that has to read as a sentence, not as a licence number — but a
// BLANK cell still means "we are waiting on this number" and must stay blank.
describe('unlicensed participants', () => {
  function loadLicence() {
    const start = SRC.indexOf('function licenceDigits(v) {');
    const END_MARK = 'return isUnlicensed(s) ? SVRZ_NO_LICENCE : s;';
    const end = SRC.indexOf(END_MARK, start);
    expect(start, 'licenceDigits not found in admin.astro').toBeGreaterThan(-1);
    expect(end, 'svrzLicenceCell not found in admin.astro').toBeGreaterThan(-1);
    const code = `${SRC.slice(start, end + END_MARK.length)}\n}\n`;
    return new Function(`${code}\nreturn { licenceDigits, isUnlicensed, svrzLicenceCell, SVRZ_NO_LICENCE };`)();
  }

  it.each(['0', '00', '0000', '00000', '000000', '00 000', ' 0 '])('reads %s as unlicensed', (v) => {
    const { isUnlicensed, svrzLicenceCell, SVRZ_NO_LICENCE } = loadLicence();
    expect(isUnlicensed(v)).toBe(true);
    expect(svrzLicenceCell(v)).toBe(SVRZ_NO_LICENCE);
  });

  it.each(['337646', '3376460', '337 646', '104501'])('leaves the real licence %s alone', (v) => {
    const { isUnlicensed, svrzLicenceCell } = loadLicence();
    expect(isUnlicensed(v)).toBe(false);
    expect(svrzLicenceCell(v)).toBe(v.trim());
  });

  // Not "unlicensed" — unknown. The export warns about these before it runs, and
  // writing the sentence here would turn a data gap into a claim about the person.
  it.each(['', '   ', null, undefined])('keeps a blank licence blank (%s)', (v) => {
    const { isUnlicensed, svrzLicenceCell } = loadLicence();
    expect(isUnlicensed(v)).toBe(false);
    expect(svrzLicenceCell(v)).toBe('');
  });

  // The signup never asks for gender, so the list must not assert one.
  it('names both genders', () => {
    const { SVRZ_NO_LICENCE } = loadLicence();
    expect(SVRZ_NO_LICENCE).toBe('Noch nicht lizenziert/e');
  });

  // 00000 must not become the filename: every unlicensed participant would land on
  // the same one, told apart only by a "(2)" suffix.
  it('is excluded from licence-named scoresheets', () => {
    const { licenceDigits, isUnlicensed } = loadLicence();
    expect(licenceDigits('00000')).toBe('00000'); // digits alone cannot tell
    expect(isUnlicensed('00000') ? '' : licenceDigits('00000')).toBe(''); // …so the caller asks first
  });
});

describe('scoresheet bundle', () => {
  it('carries binary payloads through the zip byte-for-byte', async () => {
    const { zipStore } = loadWriter();
    // Real PDF/PNG magic plus bytes that are invalid UTF-8 (0xFF 0xFE): if the
    // writer ever text-encodes a scoresheet these come back as U+FFFD and the
    // file is silently corrupt, which a text-only fixture would not catch.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xff, 0xfe, 0x00, 0x01]);
    const blob = zipStore([
      { name: 'liste.xml', xml: '<a/>' },
      { name: 'spielblaetter/Dürig Melina.pdf', bytes: pdf },
    ], 'application/zip');
    const parts = readZip(Buffer.from(await blob.arrayBuffer())); // CRC-checks every entry
    expect(Object.keys(parts)).toContain('spielblaetter/Dürig Melina.pdf'); // UTF-8 name survives
    expect(parts['spielblaetter/Dürig Melina.pdf']).toEqual(Buffer.from(pdf));
  });

  it('marks zip entry names as UTF-8 so umlauts are not mojibake', async () => {
    const { zipStore } = loadWriter();
    const buf = Buffer.from(await zipStore([{ name: 'Dürig.pdf', bytes: new Uint8Array([1, 2]) }], 'application/zip').arrayBuffer());
    expect(buf.readUInt16LE(6) & 0x0800, 'local header UTF-8 flag').toBe(0x0800);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cd = buf.readUInt32LE(eocd + 16);
    expect(buf.readUInt16LE(cd + 8) & 0x0800, 'central directory UTF-8 flag').toBe(0x0800);
  });

  it.each([
    ['Müller/Anna:*?', 'MüllerAnna'],
    ['  Dürig   Melina  ', 'Dürig Melina'],
    ['../../etc/passwd', 'etcpasswd'], // separators and leading dots both go → cannot escape the folder
    ['///', 'fallback-id'],
    ['', 'fallback-id'],
  ])('safeFileName(%s)', (input, expected) => {
    expect(loadWriter().safeFileName(input, 'fallback-id')).toBe(expected);
  });

  it('truncates absurd names instead of emitting an unopenable path', () => {
    const { safeFileName } = loadWriter();
    expect(safeFileName('ä'.repeat(500), 'x')).toHaveLength(80);
  });
});
