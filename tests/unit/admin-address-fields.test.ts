import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The SVRZ export finds the address fields by matching the OpnForm field's NAME. That
// makes these patterns a dependency on wording OpnForm owns and this repo cannot see, and
// the failure is silent: a label the patterns miss produces no error, just an empty column
// — and downstream a guessed town that looks like data once it is in a spreadsheet cell.
//
// This happened. The EN form was split into "Street and number" / "ZIP Code" / "Place",
// and `place` was not in the ort pattern, so every English signup would have fallen through
// to a guessed Zürich while the person had typed their town into the form. Caught by
// reading the live form, not by any test — hence this one.
//
// The labels below are the REAL ones in use on forms.kscw.ch. If a form is renamed, this
// test fails and the pattern gets updated — instead of the column quietly emptying.
const SRC = readFileSync('src/pages/admin.astro', 'utf8');

function loadPatterns(): Record<string, RegExp> {
  const start = SRC.indexOf('var ADDR_PATTERNS = {');
  expect(start, 'ADDR_PATTERNS not found in admin.astro').toBeGreaterThan(-1);
  const end = SRC.indexOf('\n    };', start);
  expect(end, 'ADDR_PATTERNS end not found').toBeGreaterThan(-1);
  const code = SRC.slice(start, end + '\n    };'.length);
  return new Function(`${code}\nreturn ADDR_PATTERNS;`)();
}

const P = loadPatterns();

// Exactly as they read on the live forms today.
const LIVE_LABELS: Array<[keyof typeof P & string, string, string]> = [
  ['strasse', 'Strasse und Nummer', 'DE form'],
  ['strasse', 'Street and number', 'EN form'],
  ['plz', 'PLZ', 'DE form'],
  ['plz', 'ZIP Code', 'EN form'],
  ['ort', 'Ort', 'DE form'],
  ['ort', 'Place', 'EN form'],
  ['adresse', 'Adresse', 'pre-split DE'],
  ['adresse', 'Address', 'pre-split EN'],
  ['adresse', 'Addresse mit Wohnort', 'the double-d spelling that was briefly live'],
];

describe('admin SVRZ address field detection', () => {
  it.each(LIVE_LABELS)('%s matches the real label %j (%s)', (key, label) => {
    expect(P[key].test(label), `"${label}" is not detected as ${key}`).toBe(true);
  });

  // A pattern that matches everything detects nothing useful — it would put the street in
  // the postcode column rather than leave it blank.
  it('does not cross-match between field kinds', () => {
    expect(P.plz.test('Strasse und Nummer')).toBe(false);
    expect(P.plz.test('Street and number')).toBe(false);
    expect(P.ort.test('Strasse und Nummer')).toBe(false);
    expect(P.ort.test('PLZ')).toBe(false);
    expect(P.strasse.test('PLZ')).toBe(false);
    expect(P.strasse.test('Ort')).toBe(false);
  });

  // These are anchored at the start, so an unrelated field mentioning a word in passing
  // does not get pulled in as an address.
  it('ignores unrelated fields', () => {
    for (const label of ['Vorname', 'Nachname', 'Email', 'Natel', 'Geburtsdatum', 'Team', 'Club und team']) {
      for (const key of Object.keys(P)) {
        expect(P[key].test(label), `"${label}" wrongly detected as ${key}`).toBe(false);
      }
    }
  });

  // The old single box and the new street field are told apart by whether PLZ/Ort are
  // FILLED, not by name — the DE split renamed "Adresse" in place, keeping its field id,
  // so pre-split answers still arrive under what is now the street field. resolveAddress
  // must therefore key off the data, and this pins that it still does.
  it('resolveAddress decides on filled PLZ/Ort, not on the field name', () => {
    const fn = SRC.slice(SRC.indexOf('function resolveAddress(m) {'), SRC.indexOf('function buildSvrzExport()'));
    expect(fn).toContain('if (plz || ort)');
    expect(fn).toMatch(/pickVal\(d, strasseIds\) \|\| pickVal\(d, addressIds\)/);
  });
});
