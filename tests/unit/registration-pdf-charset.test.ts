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
