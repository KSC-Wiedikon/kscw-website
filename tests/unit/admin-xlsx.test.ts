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
const END = "downloadBlob(blob, 'anmeldungen-' + nameBase + '.xlsx');";

function loadWriter() {
  const start = SRC.indexOf(START);
  const end = SRC.indexOf(END);
  expect(start, 'xlsx writer start marker missing').toBeGreaterThan(-1);
  expect(end, 'xlsx writer end marker missing').toBeGreaterThan(-1);
  const code = SRC.slice(start, end + END.length) + '\n}\n';
  let captured: { blob: Blob; name: string } | null = null;
  const factory = new Function('downloadBlob', `${code}\nreturn { exportRowsXLSX, colName, xmlEsc };`);
  const api = factory((blob: Blob, name: string) => { captured = { blob, name }; });
  return {
    ...api,
    async build(headers: unknown[], rows: unknown[][], sheet?: string) {
      captured = null;
      api.exportRowsXLSX('test', headers, rows, sheet);
      if (!captured) throw new Error('exportRowsXLSX did not produce a download');
      const { blob, name } = captured as { blob: Blob; name: string };
      return { name, type: blob.type, bytes: Buffer.from(await blob.arrayBuffer()) };
    },
  };
}

/** Minimal STORE-only zip reader — walks the central directory, so it fails loudly
 *  on wrong offsets/sizes, and CRC-checks every part against node's zlib. */
function readZip(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd, 'no end-of-central-directory record').toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
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
    out[name] = data.toString('utf8');
    ptr += 46 + nameLen + buf.readUInt16LE(ptr + 30) + buf.readUInt16LE(ptr + 32);
  }
  return out;
}

const HEADERS = ['Datum', 'Vorname', 'Anwesend', 'SV-Lizenz', 'Notizen'];
const ROWS = [
  ['07.07.2026 09:42', 'Davide', true, '337646', 'Trainer <VBC> & "Spada"'],
  ['05.07.2026 12:00', 'Melina', false, '', 'Dürig 🏐'],
];

describe('admin .xlsx export', () => {
  it('produces a readable zip: every part CRC-checks and the offsets resolve', async () => {
    const { build } = loadWriter();
    const { name, type, bytes } = await build(HEADERS, ROWS);
    expect(name).toBe('anmeldungen-test.xlsx');
    expect(type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // "PK\3\4"

    const parts = readZip(bytes); // throws/fails on any bad offset, size or CRC
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels',
      'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ]);
  });

  it('writes the tracking toggles as real booleans and everything else as text', async () => {
    const { build } = loadWriter();
    const sheet = readZip((await build(HEADERS, ROWS)).bytes)['xl/worksheets/sheet1.xml'];
    // Present=true → C2, Present=false → C3. Booleans stay filterable/countable in Excel.
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain('<c r="C3" t="b"><v>0</v></c>');
    // A licence number stays a string so a leading zero can never be eaten.
    expect(sheet).toMatch(/<c r="D2"[^>]*t="inlineStr"><is><t[^>]*>337646</);
    // Empty cells are omitted; explicit r= refs keep the later columns aligned.
    expect(sheet).not.toContain('r="D3"');
    expect(sheet).toMatch(/<c r="E3"/);
    // Header row is bold (style 1) and frozen.
    expect(sheet).toMatch(/<c r="A1" s="1"/);
    expect(sheet).toContain('state="frozen"');
  });

  it('escapes XML metacharacters rather than emitting broken markup', async () => {
    const { build, xmlEsc } = loadWriter();
    const sheet = readZip((await build(HEADERS, ROWS)).bytes)['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('Trainer &lt;VBC&gt; &amp; &quot;Spada&quot;');
    expect(sheet).toContain('Dürig 🏐');
    expect(xmlEsc('a\u0007b')).toBe('ab'); // control chars are illegal in XML 1.0
  });

  it('keeps the sheet name within Excel limits', async () => {
    const { build } = loadWriter();
    const parts = readZip((await build(HEADERS, ROWS, 'Schreiberkurs 2026 / Zürich [DE]:*?')).bytes);
    const sheetName = parts['xl/workbook.xml'].match(/<sheet name="([^"]*)"/)?.[1] ?? '';
    expect(sheetName.length).toBeLessThanOrEqual(31);
    expect(sheetName).not.toMatch(/[\\/?*[\]:]/); // characters Excel rejects in a tab name
  });

  it('handles a course with no signups', async () => {
    const { build } = loadWriter();
    const parts = readZip((await build(HEADERS, [])).bytes);
    expect(parts['xl/worksheets/sheet1.xml']).toContain('<c r="A1" s="1"'); // header row only
  });
});
