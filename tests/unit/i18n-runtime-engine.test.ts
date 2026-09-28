/**
 * Behaviour tests for the runtime i18n engine (`public/js/i18n.js`), run in a
 * minimal fake browser — audit 2026-09-28, findings F-46 … F-49.
 *
 *   F-46  a deleted Seitentexte override must bring back the shipped German text
 *         without a rebuild (the build baked the override into the HTML);
 *   F-47  the runtime override layer applies the build's rule — known key, same
 *         `{placeholder}` set — instead of trusting every row;
 *   F-48  a failed dictionary fetch falls back to German, and never leaves t()
 *         returning raw key names;
 *   F-49  a stale language response that lands after a newer toggle is dropped.
 *
 * The engine is loaded exactly as the browser loads it (an IIFE reading globals),
 * with fetch() under the test's control so the ordering of responses is explicit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'public/js/i18n.js'), 'utf8');

type Dict = Record<string, string>;
interface FakeNode { attrs: Record<string, string>; textContent: string; setAttribute(k: string, v: string): void; getAttribute(k: string): string | null; removeAttribute(k: string): void }

function node(attrs: Record<string, string>, text = ''): FakeNode {
  return {
    attrs: { ...attrs },
    textContent: text,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
  };
}

interface Reply { ok: boolean; status: number; body?: unknown }
type Responder = (url: string) => Promise<Reply> | Reply;

function res(r: Reply) {
  return { ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) };
}

/** Deferred reply, so a test decides when a response lands. */
function deferred() {
  let resolveFn!: (r: Reply) => void;
  const promise = new Promise<Reply>((r) => { resolveFn = r; });
  return { promise, resolve: resolveFn };
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

function boot(opts: {
  navLang?: string;
  stored?: string | null;
  nodes?: FakeNode[];
  baked?: string[];
  respond: Responder;
}) {
  const nodes = opts.nodes ?? [];
  const html = { lang: 'de' };
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const doc = {
    documentElement: html,
    readyState: 'complete',
    querySelectorAll(sel: string) {
      const exact = sel.match(/^\[([a-z0-9-]+)="([^"]*)"\]$/i);
      if (exact) return nodes.filter((n) => n.attrs[exact[1]] === exact[2]);
      const has = sel.match(/^\[([a-z0-9-]+)\]$/i);
      if (has) return nodes.filter((n) => has[1] in n.attrs);
      return [];
    },
    querySelector() { return null; },
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(e: { type: string }) { (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
  };
  const win: Record<string, unknown> = {
    __I18N_V: { de: 'x', en: 'y' },
    __I18N_BAKED: opts.baked ?? [],
    __KSCW_DIRECTUS: 'https://directus.kscw.ch',
    kscwSafeHref: (v: string) => v,
    location: { hostname: 'kscw.ch' },
  };
  const storage = { getItem: () => opts.stored ?? null, setItem: () => undefined };
  const fetchFn = (url: string) => Promise.resolve(opts.respond(url)).then(res);
  class CE { type: string; detail: unknown; constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } }
  const quiet = { error() {}, debug() {}, warn() {}, log() {} };
  new Function('window', 'document', 'localStorage', 'navigator', 'fetch', 'CustomEvent', 'console', SRC)(
    win, doc, storage, { language: opts.navLang ?? 'de-CH' }, fetchFn, CE, quiet,
  );
  return { win: win as Record<string, any>, html, nodes };
}

const DE: Dict = { hello: 'Hallo', teamLine: 'Team {team}', bakedKey: 'Ausgelieferter Text' };
const EN: Dict = { hello: 'Hello', teamLine: 'Team {team}', bakedKey: 'Shipped text' };

function dictResponder(extra: (url: string) => Reply | Promise<Reply> | undefined = () => undefined): Responder {
  return (url) => {
    const x = extra(url);
    if (x) return x;
    if (url.startsWith('/js/i18n/de.json')) return { ok: true, status: 200, body: DE };
    if (url.startsWith('/js/i18n/en.json')) return { ok: true, status: 200, body: EN };
    if (url.endsWith('/kscw/site-text')) return { ok: true, status: 200, body: { de: {}, en: {} } };
    return { ok: false, status: 404 };
  };
}

describe('F-48 — a failed dictionary fetch', () => {
  it('falls back to the German dictionary instead of returning raw keys', async () => {
    const { win, html } = boot({
      navLang: 'en-GB',
      respond: dictResponder((url) => (url.startsWith('/js/i18n/en.json') ? { ok: false, status: 503 } : undefined)),
    });
    expect(await win.i18nReady).toBe('de');
    expect(html.lang).toBe('de');
    expect(win.i18n.t('hello')).toBe('Hallo');
  });

  it('returns an empty string, not the key, when no dictionary loaded at all', async () => {
    const { win } = boot({ navLang: 'en-GB', respond: () => ({ ok: false, status: 503 }) });
    await win.i18nReady;
    expect(win.i18n.t('hello')).toBe('');
  });

  it('still returns the key for a key missing from a LOADED dictionary', async () => {
    const { win } = boot({ respond: dictResponder() });
    await win.i18nReady;
    expect(win.i18n.t('noSuchKey')).toBe('noSuchKey');
  });
});

describe('F-49 — language toggle race', () => {
  it('drops a slow response that lands after a newer toggle', async () => {
    const slowEn = deferred();
    const { win, html } = boot({
      respond: dictResponder((url) => (url.startsWith('/js/i18n/en.json') ? slowEn.promise : undefined)),
    });
    await win.i18nReady;                // German, cached
    const toEn = win.i18n.setLang('en'); // in flight…
    const toDe = win.i18n.setLang('de'); // …overtaken by a cached switch back
    await toDe;
    slowEn.resolve({ ok: true, status: 200, body: EN });
    await toEn;
    await flush();
    expect(win.i18n.getLang()).toBe('de');
    expect(html.lang).toBe('de');
    expect(win.i18n.t('hello')).toBe('Hallo');
  });

  it('still switches normally when nothing overtakes it', async () => {
    const { win, html } = boot({ respond: dictResponder() });
    await win.i18nReady;
    await win.i18n.setLang('en');
    expect(win.i18n.getLang()).toBe('en');
    expect(html.lang).toBe('en');
  });
});

describe('F-47 — runtime overrides follow the build rule', () => {
  const overrides = {
    de: { hello: 'Grüezi', teamLine: 'Mannschaft ohne Platzhalter', ghostKey: 'nicht im Wörterbuch' },
    en: {},
  };
  const respond = dictResponder((url) =>
    url.endsWith('/kscw/site-text') ? { ok: true, status: 200, body: overrides } : undefined);

  it('applies a valid override', async () => {
    const { win } = boot({ respond });
    await win.i18nReady; await flush();
    expect(win.i18n.t('hello')).toBe('Grüezi');
  });

  it('refuses an override that drops a placeholder the code interpolates', async () => {
    const { win } = boot({ respond });
    await win.i18nReady; await flush();
    expect(win.i18n.t('teamLine', { team: 'H1' })).toBe('Team H1');
  });

  it('refuses an override for a key the dictionary does not have', async () => {
    const { win } = boot({ respond });
    await win.i18nReady; await flush();
    expect(win.i18n.t('ghostKey')).toBe('ghostKey');
  });
});

describe('F-46 — a deleted override that the build baked in', () => {
  it('re-renders the shipped German text once the override is gone', async () => {
    const baked = node({ 'data-i18n': 'bakedKey' }, 'Alter Override-Text');
    const { win } = boot({ nodes: [baked], baked: ['bakedKey'], respond: dictResponder() });
    await win.i18nReady; await flush();
    expect(baked.textContent).toBe('Ausgelieferter Text');
  });

  it('keeps the baked text while the override still exists', async () => {
    const baked = node({ 'data-i18n': 'bakedKey' }, 'Alter Override-Text');
    const { win } = boot({
      nodes: [baked], baked: ['bakedKey'],
      respond: dictResponder((url) => (url.endsWith('/kscw/site-text')
        ? { ok: true, status: 200, body: { de: { bakedKey: 'Alter Override-Text' }, en: {} } } : undefined)),
    });
    await win.i18nReady; await flush();
    expect(baked.textContent).toBe('Alter Override-Text');
  });

  it('does NOT revert anything when the override fetch fails', async () => {
    const baked = node({ 'data-i18n': 'bakedKey' }, 'Alter Override-Text');
    const { win } = boot({
      nodes: [baked], baked: ['bakedKey'],
      respond: dictResponder((url) => (url.endsWith('/kscw/site-text') ? { ok: false, status: 502 } : undefined)),
    });
    await win.i18nReady; await flush();
    expect(baked.textContent).toBe('Alter Override-Text');
  });
});

describe('F-46/F-48 interaction — no dictionary, overrides reachable', () => {
  it('leaves the server-rendered German text alone instead of blanking it', async () => {
    const n = node({ 'data-i18n': 'bakedKey' }, 'Gebackener Override');
    const m = node({ 'data-i18n': 'hello' }, 'Hallo');
    const { win } = boot({
      baked: ['bakedKey'],
      nodes: [n, m],
      respond: (url) => (url.endsWith('/kscw/site-text')
        ? { ok: true, status: 200, body: { de: { hello: 'Grüezi' }, en: {} } }
        : { ok: false, status: 503 }),
    });
    await win.i18nReady;
    await flush();
    expect(n.textContent).toBe('Gebackener Override');
    expect(m.textContent).toBe('Hallo');
  });
});
