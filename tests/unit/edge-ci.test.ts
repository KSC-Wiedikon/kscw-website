/**
 * The edge (Cloudflare Pages Functions, `_routes.json`, `_redirects`, the CSP's CDN
 * entries) and the CI/deploy workflows — pinned after the 2026-09-28 audit
 * (F-13, F-40, F-42, F-43, F-44, F-62; see SECURITY.md).
 *
 * None of this is observable from `astro preview` (no Functions, no `_headers`,
 * no `_redirects`) and none of it runs until GitHub or Cloudflare does, so these
 * file-level assertions are the only gate before a regression ships.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
// @ts-ignore — plain ESM module without types (Cloudflare Pages Function)
import { legacyRedirectPath, onRequest, LEGACY_EXACT } from '../../functions/_middleware.js';

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

// ── F-40: the legacy /de/… /en/… redirects ───────────────────────────────────

describe('functions/_middleware.js — legacy locale redirects', () => {
  it.each([
    ['/de', '/'],
    ['/de/', '/'],
    ['/en', '/'],
    ['/en/', '/'],
    ['/de/club/ueber-uns', '/club/ueber-uns'],
    ['/en/club/ueber-uns/', '/club/ueber-uns/'],
    ['/en/volleyball/regulations', '/volleyball/reglemente'],
    ['/en/volleyball/regulations/', '/volleyball/reglemente'],
    ['/en/volleyball/scheduling', '/volleyball/spielplanung'],
    ['/en/basketball/scheduling', '/basketball/spielplanung'],
    ['/de/volleyball/mixed-turnier', '/volleyball'],
    ['/en/volleyball/mixed-tournament', '/volleyball'],
    ['/en/volleyball/mixed-turnier', '/volleyball'],
  ])('%s → %s', (from, to) => {
    expect(legacyRedirectPath(from)).toBe(to);
  });

  it.each(['/', '/dex', '/english', '/club/de/x', '/volleyball', '/deutsch/'])(
    'leaves %s alone',
    (p) => {
      expect(legacyRedirectPath(p)).toBeNull();
    },
  );

  // The open-redirect shapes: a splat that starts with `/` or `\` would make the
  // Location protocol-relative (another host). None may survive, raw or encoded.
  it.each([
    '/de//evil.example',
    '/de///evil.example/x',
    '/en//evil.example',
    '/de/\\evil.example',
    '/de/\\\\evil.example',
    '/de/\\/evil.example',
    '/de/%2Fevil.example',
    '/de/%2f%2fevil.example',
    '/de/%5Cevil.example',
    '/de/%5c%5Cevil.example',
    '/en/%2F%5Cevil.example',
    '/de//%2F/evil.example',
  ])('%s cannot redirect off-site', (p) => {
    const out = legacyRedirectPath(p) as string;
    expect(out.startsWith('/')).toBe(true);
    expect(out).not.toMatch(/^[/\\]{2}/);
    expect(out).not.toMatch(/^\/[/\\]/);
    expect(out).toBe('/evil.example' + (p.endsWith('/x') ? '/x' : ''));
    // What a browser would actually do with the Location header.
    expect(new URL(out, 'https://kscw.ch').host).toBe('kscw.ch');
  });

  it('every exact rule targets a single-slash same-site path', () => {
    for (const [from, to] of Object.entries(LEGACY_EXACT as Record<string, string>)) {
      expect(from).toMatch(/^\/(de|en)\//);
      expect(to).toMatch(/^\/[a-z]/);
    }
  });

  const next = () => new Response('static', { status: 200 });

  it('onRequest 301s to an absolute same-origin URL and keeps the query string', async () => {
    const res: Response = await onRequest({
      request: new Request('https://kscw.ch/de//evil.example?x=1'),
      next,
    });
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://kscw.ch/evil.example?x=1');
  });

  it('onRequest passes non-legacy paths through', async () => {
    const res: Response = await onRequest({
      request: new Request('https://kscw.ch/club/ueber-uns'),
      next,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('static');
  });

  // F-43: the pages.dev → kscw.ch window closed on 2026-07-08.
  it('no longer carries the expired pages.dev host redirect', async () => {
    expect(read('functions/_middleware.js')).not.toMatch(/hostname\s*===/);
    const res: Response = await onRequest({
      request: new Request('https://kscw-website.pages.dev/club/ueber-uns'),
      next,
    });
    expect(res.status).toBe(200);
  });
});

describe('public/_routes.json — Functions run only for /de and /en (F-43)', () => {
  const routes = JSON.parse(read('public/_routes.json'));

  it('includes exactly the four legacy locale patterns', () => {
    expect(routes.version).toBe(1);
    expect([...routes.include].sort()).toEqual(['/de', '/de/*', '/en', '/en/*']);
    expect(routes.exclude).toEqual([]);
  });

  it('only functions/_middleware.js exists — no other route would be reachable', () => {
    expect(readdirSync(resolve(root, 'functions'))).toEqual(['_middleware.js']);
  });
});

describe('public/_redirects — no locale rules (F-40)', () => {
  const rules = read('public/_redirects')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('has no /de or /en rule — Functions own them, and _redirects is skipped there', () => {
    expect(rules.filter((l) => /^\/(de|en)(\/|\s|$)/.test(l))).toEqual([]);
  });

  it('no rule anywhere uses a splat that could start with a slash', () => {
    expect(rules.filter((l) => /:splat/.test(l))).toEqual([]);
  });
});

// ── F-62: the CSP names exact CDN files, not whole origins ────────────────────

const CSP = read('public/_headers')
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('Content-Security-Policy:')) as string;

function directive(name: string): string[] {
  const chunk = CSP.replace(/^Content-Security-Policy:\s*/, '')
    .split(';')
    .map((c) => c.trim().split(/\s+/))
    .find((parts) => parts[0] === name);
  return chunk ? chunk.slice(1) : [];
}

const CDN = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)[^\s"'`)<>]*/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(astro|js|ts|mjs|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

describe('public/_headers — CDN sources are exact files (F-62)', () => {
  const cdnSources = ['script-src', 'style-src', 'connect-src', 'img-src', 'font-src'].flatMap(
    (d) => directive(d).filter((s) => /unpkg\.com|jsdelivr\.net/.test(s)).map((s) => [d, s]),
  );

  it('no directive allows a whole CDN origin or a directory', () => {
    for (const [d, src] of cdnSources) {
      expect(`${d} ${src}`).toMatch(/@\d+\.\d+\.\d+\/.+\.(js|css)$/);
    }
  });

  it('connect-src names no CDN — SRI script/style loads are not fetch()es', () => {
    expect(directive('connect-src').filter((s) => /unpkg|jsdelivr/.test(s))).toEqual([]);
  });

  it('every CDN file the site loads is allowed by the right directive', () => {
    const used = new Set<string>();
    for (const f of [...walk(resolve(root, 'src')), ...walk(resolve(root, 'public'))]) {
      for (const m of readFileSync(f, 'utf8').match(CDN) || []) used.add(m);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const url of used) {
      const want = url.endsWith('.css') ? 'style-src' : 'script-src';
      expect(directive(want), url).toContain(url);
    }
  });

  it('every CDN file the CSP allows is still used (no stale allowances)', () => {
    const corpus = [...walk(resolve(root, 'src')), ...walk(resolve(root, 'public'))]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const [, src] of cdnSources) expect(corpus).toContain(src);
  });
});

// ── F-42 / F-44 / F-13: workflows ─────────────────────────────────────────────

describe('.github/workflows/deploy-cloudflare-pages.yml', () => {
  const wf = read('.github/workflows/deploy-cloudflare-pages.yml');

  it('builds through npm so the prebuild site-text bake runs (F-42)', () => {
    expect(wf).toMatch(/^\s*run: npm run build\s*$/m);
    expect(wf).not.toMatch(/^\s*run: npx astro build/m);
  });

  it('deploys only after the test suite passed (F-44)', () => {
    expect(wf).toMatch(/^\s{2}test:\n\s{4}uses: \.\/\.github\/workflows\/test\.yml/m);
    expect(wf).toMatch(/^\s{2}deploy:\n\s{4}needs: test$/m);
    // The Cloudflare token must not reach the test workflow.
    expect(wf).not.toMatch(/secrets: inherit/);
  });

  it('test.yml is callable and not also push-triggered (would run the suite twice)', () => {
    const t = read('.github/workflows/test.yml');
    expect(t).toMatch(/^\s{2}workflow_call:/m);
    expect(t).not.toMatch(/^\s{2}push:/m);
  });
});

describe('.github/workflows/bugfix-ai.yml — least privilege (F-13)', () => {
  const wf = read('.github/workflows/bugfix-ai.yml');
  const fixJob = wf.slice(wf.indexOf('\n  fix:'), wf.indexOf('\n  publish:'));
  const publishJob = wf.slice(wf.indexOf('\n  publish:'));

  it('uses v1 claude_args, not the removed allowed_tools / model inputs', () => {
    expect(wf).toContain('anthropics/claude-code-action@v1');
    expect(wf).not.toMatch(/^\s+allowed_tools:/m);
    expect(wf).not.toMatch(/^\s+model:/m);
    expect(wf).toMatch(/--allowedTools "Read,Write,Edit,Glob,Grep"\s/);
    expect(wf).toMatch(/--disallowedTools "Bash,WebFetch,WebSearch"/);
    expect(wf).not.toMatch(/Bash\(/);
    expect(wf).toMatch(/- name: Verify build\s+run: npm run build/);
  });

  it('the agent job holds a read-only token and no persisted git credentials', () => {
    expect(wf).toMatch(/^permissions: \{\}$/m);
    expect(fixJob).toMatch(/permissions:\n\s+contents: read\n/);
    expect(fixJob).not.toMatch(/: write/);
    expect(fixJob).toContain('persist-credentials: false');
    expect(fixJob).not.toMatch(/git (push|commit)|gh pr/);
  });

  it('the publish job refuses workflow edits and opens a draft PR on bugfix/<hash>', () => {
    expect(publishJob).toContain('persist-credentials: false');
    expect(publishJob).toMatch(/\.github\/.*refused/);
    expect(publishJob).toMatch(/gh pr create --draft --base dev --head "bugfix\/\$\{ERROR_HASH\}"/);
    expect(publishJob).toMatch(/\^\[a-zA-Z0-9_-\]\{1,64\}\$/);
  });

  it('every checkout in every workflow keeps no credentials, except the cherry-pick one', () => {
    for (const f of readdirSync(resolve(root, '.github/workflows'))) {
      if (f === 'bugfix-deploy-prod.yml') continue; // pushes with the checkout's token by design
      const text = read(`.github/workflows/${f}`);
      const checkouts = text.split('uses: actions/checkout@').slice(1);
      for (const c of checkouts) {
        expect(c.slice(0, 200), f).toContain('persist-credentials: false');
      }
    }
  });
});
