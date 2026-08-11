import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// The basketball licence dossier is assembled by writing into FIBA's AcroForm
// fields by name, from two places: the applicant's pre-filled download on the
// public registration form, and the club's re-generation in /admin. Both use
// pdf-lib, and both swallow a miss — setField() catches, and the admin wraps
// every getTextField in its own try/catch — because a form that is missing a
// field must still download. That is the right behaviour and it is also why a
// mistyped field name is invisible: the box is simply blank on the PDF Swiss
// Basketball receives, and nobody finds out until they reject the dossier.
//
// So assert against the shipped PDF itself: every name the code writes to must
// exist in the document.

const FORM_SRC = readFileSync('public/js/registration-form.js', 'utf8');
const ADMIN_SRC = readFileSync('src/pages/admin.astro', 'utf8');
const PDF = readFileSync('public/docs/acknowledgment-national-team-restriction-fiba.pdf');

/** Field names (/T entries) in an AcroForm, including those inside object streams. */
function pdfFieldNames(pdf: Buffer): Set<string> {
  const names = new Set<string>();
  const collect = (buf: Buffer) => {
    for (const m of buf.toString('latin1').matchAll(/\/T\s*\(((?:\\.|[^\\)])*)\)/g)) {
      names.add(m[1].replace(/\\([()\\])/g, '$1'));
    }
  };
  collect(pdf);
  // Acrobat writes this form's fields into compressed object streams, so the
  // names are not in the raw bytes — inflate everything that inflates.
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = pdf.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;
    try {
      collect(inflateSync(pdf.subarray(start, end)));
    } catch {
      /* not a flate stream (image, already-plain data) — nothing to read */
    }
  }
  return names;
}

/** The source between two markers, so a test reads the block that actually ships. */
function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `start marker missing: ${startMarker}`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end, `end marker missing: ${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

const FIELDS = pdfFieldNames(PDF);

describe('Acknowledgment of National Team Restriction — field wiring', () => {
  it('reads the field names out of the shipped PDF', () => {
    // Guards the parser itself: if this ever comes back empty the assertions
    // below would pass vacuously.
    expect(FIELDS.size).toBeGreaterThan(5);
    expect(FIELDS.has('Player full name')).toBe(true);
  });

  it('writes only fields the public form PDF actually has', () => {
    const block = slice(FORM_SRC, "var natDeclLink = document.getElementById('bb-doc-natdecl')", '// Freibrief');
    const written = [...block.matchAll(/setField\(f, '([^']+)'/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(3);
    for (const name of written) {
      expect(FIELDS.has(name), `no such field in the PDF: "${name}"`).toBe(true);
    }
  });

  it('writes only fields the admin PDF actually has', () => {
    const block = slice(ADMIN_SRC, '// Acknowledgment of National Team Restriction', 'form2.flatten()');
    const written = [...block.matchAll(/form2\.getTextField\('([^']+)'\)/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(3);
    for (const name of written) {
      expect(FIELDS.has(name), `no such field in the PDF: "${name}"`).toBe(true);
    }
  });

  it('fills the federation of origin from both paths', () => {
    // The box exists on the form and the applicant answers it on the
    // registration form, so neither path may go back to leaving it blank.
    const ORIGIN = 'National Member Federation of origin';
    expect(FIELDS.has(ORIGIN)).toBe(true);
    expect(FORM_SRC).toContain(`setField(f, '${ORIGIN}'`);
    expect(ADMIN_SRC).toContain(`form2.getTextField('${ORIGIN}')`);
  });
});

describe('federation table', () => {
  it('is shared, not copied into either consumer', () => {
    // The applicant downloads the Acknowledgment from the public form and the
    // club may regenerate it from /admin; two tables would eventually spell one
    // federation two ways on the same dossier.
    const shared = readFileSync('public/js/federations.js', 'utf8');
    expect(shared).toContain('window.KSCW_FEDERATIONS');
    for (const [label, src] of [['registration-form.js', FORM_SRC], ['admin.astro', ADMIN_SRC]] as const) {
      expect(src, `${label} must read the shared table`).toContain('KSCW_FEDERATIONS');
      expect(src, `${label} must not redeclare the table`).not.toMatch(/var FEDERATIONS = \{[\s\S]*volleyball:/);
    }
  });

  it('covers the same countries for both sports', () => {
    // A country listed for one sport but not the other silently degrades that
    // sport's picker to a bare country name for exactly those applicants.
    const shared = readFileSync('public/js/federations.js', 'utf8');
    const codesFor = (sport: string) => {
      const block = slice(shared, `${sport}: {`, '\n  }');
      return [...block.matchAll(/\b([A-Z]{2}):/g)].map((m) => m[1]).sort();
    };
    expect(codesFor('basketball')).toEqual(codesFor('volleyball'));
  });

  it('is loaded before the form script that reads it at start-up', () => {
    const page = readFileSync('src/pages/weiteres/anmeldung.astro', 'utf8');
    const shared = page.indexOf("js/federations.js");
    const form = page.indexOf("js/registration-form.js");
    expect(shared, 'anmeldung.astro must load js/federations.js').toBeGreaterThan(-1);
    expect(shared).toBeLessThan(form);
    expect(ADMIN_SRC).toContain('/js/federations.js');
  });
});
