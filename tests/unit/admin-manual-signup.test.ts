import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A signup can now be added by hand in /admin — a latecomer, a phone call, a name handed
// over at the hall. It is NOT written into OpnForm (that would re-fire the form's
// notification emails, and a form past its deadline rejects the write); it is stored as a
// scorer_course_attendance row whose submission_id marks it as hand-added.
//
// Two rules hold that together, and both are silent when broken:
//   • a hand-added row must be recognisable as one, or its delete goes to OpnForm and
//     404s on a submission id OpnForm has never heard of;
//   • a real submission id must never look hand-added, or deleting a genuine signup would
//     leave it standing in the form.
const SRC = readFileSync('src/pages/admin.astro', 'utf8');

function snippet(startMarker: string): string {
  const start = SRC.indexOf(startMarker);
  expect(start, `${startMarker} not found in admin.astro`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n    }', start);
  expect(end, `end of ${startMarker} not found`).toBeGreaterThan(-1);
  return SRC.slice(start, end + '\n    }'.length);
}

function load<T>(markers: string[], ret: string): T {
  return new Function(`${markers.map(snippet).join('\n')}\nreturn ${ret};`)() as T;
}

const manualSubmissionId = load<() => string>(['function manualSubmissionId()'], 'manualSubmissionId');
const isManualSubmission = load<(id: unknown) => boolean>(['function isManualSubmission('], 'isManualSubmission');
const sameLicence = load<(a: unknown, b: unknown) => boolean>(
  ['function isUnlicensed(', 'function sameLicence('], 'sameLicence');

describe('hand-added scorer signups', () => {
  it('mints ids its own reader recognises', () => {
    expect(isManualSubmission(manualSubmissionId())).toBe(true);
  });

  it('does not mint the same id twice', () => {
    const ids = new Set(Array.from({ length: 200 }, () => manualSubmissionId()));
    expect(ids.size).toBe(200);
  });

  // OpnForm submission ids are integers or uuids; neither may be mistaken for a hand-added
  // row, or a real signup's delete would silently miss the form.
  it.each(['1', '42', 'b1f0c2de-4d3a-4f7e-9a1b-2c3d4e5f6071', '', 'manual', 'not-manual-1'])(
    'treats %j as a real submission id',
    (id) => { expect(isManualSubmission(id)).toBe(false); },
  );

  it('treats a missing id as not hand-added', () => {
    expect(isManualSubmission(null)).toBe(false);
    expect(isManualSubmission(undefined)).toBe(false);
  });
});

describe('licence cross-check', () => {
  // The SV licence column shows the tracked value once anyone types one, hiding what the
  // participant wrote on the form. These are the comparisons that decide whether the
  // admin is told the two disagree.
  it('ignores the spacing people type a licence with', () => {
    expect(sameLicence('337 646', '337646')).toBe(true);
    expect(sameLicence('337-646', '337646')).toBe(true);
  });

  it('flags a genuinely different number', () => {
    expect(sameLicence('337646', '337645')).toBe(false);
    expect(sameLicence('', '337646')).toBe(false);
  });

  // "0" and "00000" are two spellings of "not licensed yet", not a disagreement to
  // reconcile — and licenceDigits() blanks both, so it cannot make this call.
  it('reads every all-zero answer as the same statement', () => {
    expect(sameLicence('0', '00000')).toBe(true);
    expect(sameLicence('00', '0')).toBe(true);
  });

  it('does not confuse "not licensed" with a real number', () => {
    expect(sameLicence('0', '337646')).toBe(false);
  });
});
