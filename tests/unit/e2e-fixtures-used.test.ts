import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// tests/e2e/fixtures.ts swallows the site's error reports (/kscw/client-error) so the
// e2e suite stops filling the DEV error log with the 500s it fakes on purpose. A spec
// that takes `test` straight from '@playwright/test' skips that fixture and leaks again,
// silently: nothing fails, the dev log just fills up. Type-only imports are fine.
const dir = join(__dirname, '..', 'e2e');
const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));

describe('e2e specs use the shared fixture', () => {
  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  for (const file of specs) {
    it(`${file} imports test from ./fixtures, not @playwright/test`, () => {
      const src = readFileSync(join(dir, file), 'utf8');
      const direct = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@playwright\/test'/g)]
        .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean))
        .filter((name) => !name.startsWith('type '));
      expect(direct).toEqual([]);
    });
  }
});
