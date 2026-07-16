import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The image→PDF writer lives inside admin.astro's `is:inline` script, so it cannot be
// imported. Extract and eval the shipped source rather than copying it — a copy would
// drift, and the point of this test is the raw byte layout. A PDF's xref table is a list
// of absolute byte offsets: get one wrong and readers reject the file outright, or worse
// render a blank page. Every scoresheet in an SVRZ bundle goes through here, and nobody
// opens the zip before SVRZ does.
const SRC = readFileSync('src/pages/admin.astro', 'utf8');
const START = 'function pdfNum(n) {';
const END = '      return out;\n    }';

function loadWriter() {
  const start = SRC.indexOf(START);
  const end = SRC.indexOf(END);
  expect(start, 'pdf writer start marker missing').toBeGreaterThan(-1);
  expect(end, 'pdf writer end marker missing').toBeGreaterThan(-1);
  const code = SRC.slice(start, end + END.length);
  return new Function(`${code}\nreturn { buildImagePdf, pdfNum };`)() as {
    buildImagePdf: (jpeg: Uint8Array, w: number, h: number) => Uint8Array;
    pdfNum: (n: number) => string;
  };
}

const { buildImagePdf, pdfNum } = loadWriter();

// Not a real JPEG — buildImagePdf never decodes it, it only embeds the bytes and counts
// them. Distinctive bytes make the "embedded intact" assertion meaningful.
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xd9]);
const asLatin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('buildImagePdf — structure', () => {
  it('emits a PDF header and EOF marker', () => {
    const s = asLatin1(buildImagePdf(fakeJpeg, 100, 200));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  // The binary marker must be real high bytes. Writing it through TextEncoder would
  // silently UTF-8 encode \xFF into two bytes and defeat the purpose.
  it('writes the binary comment as raw high bytes', () => {
    const b = buildImagePdf(fakeJpeg, 100, 200);
    expect(Array.from(b.slice(9, 15))).toEqual([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  });

  it('embeds the JPEG bytes unmodified', () => {
    const s = asLatin1(buildImagePdf(fakeJpeg, 100, 200));
    expect(s).toContain(asLatin1(fakeJpeg));
  });

  it('declares a /Length equal to the real stream length', () => {
    const s = asLatin1(buildImagePdf(fakeJpeg, 100, 200));
    expect(s).toContain(`/Filter /DCTDecode /Length ${fakeJpeg.length}`);
  });
});

describe('buildImagePdf — xref table', () => {
  // The whole reason this test exists. Each xref offset must land exactly on its object.
  it('points every xref offset at the object it claims', () => {
    const bytes = buildImagePdf(fakeJpeg, 100, 200);
    const s = asLatin1(bytes);
    const xrefAt = s.lastIndexOf('xref\n0 6\n');
    expect(xrefAt, 'xref table missing').toBeGreaterThan(-1);

    const table = s.slice(xrefAt + 'xref\n0 6\n'.length);
    for (let n = 1; n <= 5; n++) {
      // Entries are fixed-width 20 bytes; entry 0 is the free-list head.
      const entry = table.slice(n * 20, n * 20 + 20);
      expect(entry, `xref entry ${n} is not 20 bytes`).toHaveLength(20);
      const offset = parseInt(entry.slice(0, 10), 10);
      expect(s.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
  });

  it('startxref points at the xref table', () => {
    const s = asLatin1(buildImagePdf(fakeJpeg, 100, 200));
    const declared = parseInt(/startxref\n(\d+)/.exec(s)?.[1] ?? '-1', 10);
    expect(s.slice(declared, declared + 4)).toBe('xref');
  });

  it('keeps offsets correct for a large image, where widths change', () => {
    // A 10-digit-padded offset that overflows would corrupt the table; a big stream is
    // the case that gets near it.
    const big = new Uint8Array(300_000).fill(0x41);
    const s = asLatin1(buildImagePdf(big, 4000, 3000));
    const xrefAt = s.lastIndexOf('xref\n0 6\n');
    const table = s.slice(xrefAt + 'xref\n0 6\n'.length);
    for (let n = 1; n <= 5; n++) {
      const offset = parseInt(table.slice(n * 20, n * 20 + 20).slice(0, 10), 10);
      expect(s.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
  });
});

describe('buildImagePdf — page geometry', () => {
  it('uses portrait A4 for a portrait image and landscape for a landscape one', () => {
    expect(asLatin1(buildImagePdf(fakeJpeg, 100, 200))).toContain('/MediaBox [0 0 595 842]');
    expect(asLatin1(buildImagePdf(fakeJpeg, 200, 100))).toContain('/MediaBox [0 0 842 595]');
  });

  it('fits the image inside the page and centres it', () => {
    // 1000×500 into landscape A4 (842×595): width-bound, scale 0.842 → 842×421,
    // centred vertically at (595-421)/2 = 87.
    const s = asLatin1(buildImagePdf(fakeJpeg, 1000, 500));
    const m = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(s);
    expect(m, 'content stream draw op missing').toBeTruthy();
    const [w, h, x, y] = m!.slice(1).map(Number);
    expect(w).toBeCloseTo(842, 1);
    expect(h).toBeCloseTo(421, 1);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(87, 1);
    // Never scaled beyond the page — an overflowing image would print cropped.
    expect(w).toBeLessThanOrEqual(842);
    expect(h).toBeLessThanOrEqual(595);
  });

  it('declares the image dimensions it was handed', () => {
    expect(asLatin1(buildImagePdf(fakeJpeg, 1234, 567))).toContain('/Width 1234 /Height 567');
  });
});

describe('pdfNum', () => {
  // PDF reals do not accept exponent notation; a raw JS number can produce it.
  it('emits plain decimals, never exponent notation', () => {
    expect(pdfNum(0.000001)).not.toMatch(/e/i);
    expect(pdfNum(842)).toBe('842');
    expect(pdfNum(421.05)).toBe('421.05');
  });
});
