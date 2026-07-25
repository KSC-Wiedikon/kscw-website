import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Swiss Basketball / FIBA licence forms are filled client-side with pdf-lib and
// the PDF standard font Helvetica, which encodes WinAnsi (CP1252) only. Writing a
// character outside that set throws — and the throw happens in pdfDoc.save(), so it
// takes down the entire download, not just one field. Before winAnsiSafe(), a single
// Croatian or Polish player name meant the applicant silently received a BLANK form
// (the download path's catch falls back to opening the empty PDF).
//
// Extract the shipped helper rather than copying it: a copy drifts, and the point of
// this test is that the code actually running in the browser never emits a codepoint
// Helvetica cannot encode.
const SRC = readFileSync('public/js/registration-form.js', 'utf8');

function loadHelper() {
  const mapStart = SRC.indexOf('var CP1252_EXTRA');
  expect(mapStart, 'CP1252_EXTRA map missing').toBeGreaterThan(-1);
  const mapEnd = SRC.indexOf('};', mapStart) + 2;

  const fnStart = SRC.indexOf('function encodableInWinAnsi', mapEnd);
  expect(fnStart, 'encodableInWinAnsi missing').toBeGreaterThan(-1);
  const fnEnd = SRC.indexOf('// Helper: set text field', fnStart);
  expect(fnEnd, 'winAnsiSafe end marker missing').toBeGreaterThan(fnStart);

  const code = SRC.slice(mapStart, mapEnd) + '\n' + SRC.slice(fnStart, fnEnd);
  return new Function(`${code}\nreturn { winAnsiSafe, encodableInWinAnsi };`)() as {
    winAnsiSafe: (v: unknown) => string;
    encodableInWinAnsi: (ch: string) => boolean;
  };
}

const { winAnsiSafe, encodableInWinAnsi } = loadHelper();

describe('winAnsiSafe (licence-PDF text guard)', () => {
  it('keeps accents WinAnsi already covers, verbatim', () => {
    // These render correctly in Helvetica, so folding them would needlessly
    // mangle names the forms can carry exactly as written.
    for (const s of ['Müller', 'Étienne', 'Zoë', 'Zürich', 'François', 'Straße', 'Ægir', 'Øst']) {
      expect(winAnsiSafe(s), `${s} should survive unchanged`).toBe(s);
    }
  });

  it('keeps the CP1252-only letters that appear in Balkan names', () => {
    // Š/š and Ž/ž live in the CP1252 0x80–0x9F block — encodable, so not folded.
    expect(winAnsiSafe('Šimun')).toBe('Šimun');
    expect(winAnsiSafe('Žarko')).toBe('Žarko');
  });

  it('folds the diacritics WinAnsi cannot encode', () => {
    expect(winAnsiSafe('Šarčević')).toBe('Šarcevic');
    expect(winAnsiSafe('Dvořák')).toBe('Dvorák');
    expect(winAnsiSafe('Győző')).toBe('Gyozo');
    expect(winAnsiSafe('Çağrı')).toBe('Çagri');
  });

  it('maps stroked/barred letters that NFD does not decompose', () => {
    // ł, đ have no combining-mark decomposition, so they need the explicit table.
    expect(winAnsiSafe('Łąkowa')).toBe('Lakowa');
    expect(winAnsiSafe('Đoković')).toBe('Dokovic');
  });

  it('never emits a codepoint Helvetica cannot encode', () => {
    const samples = [
      'Šarčević', 'Łukasz Ćwiąkała', 'Győző Öztürk', 'Đorđe Mitrović',
      'Ružička', 'Nguyễn Văn A', 'Ćetković', 'Þórsdóttir', 'Ægir Ø',
      '北京 Athlete', 'Δημήτρης', 'Оле́г', '🏀 Player', '', 'ok-ASCII 123',
    ];
    for (const s of samples) {
      const out = winAnsiSafe(s);
      for (const ch of out) {
        expect(
          encodableInWinAnsi(ch),
          `winAnsiSafe(${JSON.stringify(s)}) emitted un-encodable ${JSON.stringify(ch)}`,
        ).toBe(true);
      }
    }
  });

  it('drops scripts with no Latin fallback rather than throwing', () => {
    // Nothing sensible to fold to — the field is left empty for the applicant to
    // complete by hand, which is far better than aborting the whole download.
    expect(winAnsiSafe('北京')).toBe('');
    expect(winAnsiSafe('🏀')).toBe('');
  });

  it('handles null/undefined without throwing', () => {
    expect(winAnsiSafe(null)).toBe('');
    expect(winAnsiSafe(undefined)).toBe('');
  });
});


// ── Cross-writer agreement ──────────────────────────────────────────────────
// The same person's name is written by three encoders: the public form's licence
// PDFs (winAnsiSafe), the admin's licence PDFs (pdfSafe) and the admin's ClubDesk
// CSV (toCp1252Bytes). They all speak CP1252, and they used to carry SEPARATE
// transliteration tables — so a Turkish member came out "Isik" on the licence form
// and "Is?k" in the member register, from one registration. These pin them
// together; wiedisync's CP1252_TRANSLIT (clubdesk-update.js) is the fourth writer
// and carries the same set.
const ADMIN = readFileSync('src/pages/admin.astro', 'utf8');

function adminEncoders() {
  const ts = ADMIN.indexOf('var CP1252_EXTRA');
  expect(ts, 'admin CP1252_EXTRA missing').toBeGreaterThan(-1);
  const te = ADMIN.indexOf('\n    }', ADMIN.indexOf('function pdfSafe')) + '\n    }'.length;
  const cs = ADMIN.indexOf('function toCp1252Bytes');
  const ce = ADMIN.indexOf('\n    }', cs) + '\n    }'.length;
  return new Function(
    `${ADMIN.slice(ts, te)}\n${ADMIN.slice(cs, ce)}\nreturn { pdfSafe, toCp1252Bytes, CP1252_TRANSLIT };`,
  )() as {
    pdfSafe: (v: unknown) => string;
    toCp1252Bytes: (v: unknown) => Uint8Array;
    CP1252_TRANSLIT: Record<string, string>;
  };
}

function formTranslitTable(): Record<string, string> {
  const m = SRC.match(/var NON_DECOMPOSING = (\{[^}]*\});/);
  expect(m, 'NON_DECOMPOSING not found').toBeTruthy();
  return new Function(`return ${m![1]};`)();
}

describe('CP1252 writers agree', () => {
  const { pdfSafe, toCp1252Bytes, CP1252_TRANSLIT } = adminEncoders();
  const decode = (b: Uint8Array) =>
    Array.from(b).map((x) => CP1252_BYTES[x] ?? String.fromCharCode(x)).join('');
  // CP1252's 0x80-0x9F block does not match Unicode, so decoding needs the map.
  const CP1252_BYTES: Record<number, string> = {
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
    0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
    0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
    0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
  };

  it('the admin and the public form share one transliteration table', () => {
    expect(CP1252_TRANSLIT).toEqual(formTranslitTable());
  });

  it('names it cannot hold verbatim resolve to the same spelling everywhere', () => {
    for (const name of [
      'Işık', 'Altınbaş', 'Çağrı', 'Šarčević', 'Łukasz', 'Đoković',
      'Dvořák', 'Győző', 'Müller', 'Ħamrun', 'Ŧoma', 'Øst', 'Ægir', 'Straße', 'Žarko',
    ]) {
      const viaForm = winAnsiSafe(name);
      const viaAdmin = pdfSafe(name);
      const viaCsv = decode(toCp1252Bytes(name));
      expect(viaAdmin, `admin PDF vs public form for ${name}`).toBe(viaForm);
      expect(viaCsv, `ClubDesk CSV vs licence PDF for ${name}`).toBe(viaForm);
    }
  });

  it('never falls back to "?" for a letter that has a Latin form', () => {
    // '?' in the legal member register is what a missing table entry looks like.
    for (const name of ['Işık', 'Altınbaş', 'Ħamrun', 'Ŧoma', 'Đoković', 'Łukasz']) {
      expect(decode(toCp1252Bytes(name)), `${name} lost a letter to "?"`).not.toContain('?');
    }
  });
});
