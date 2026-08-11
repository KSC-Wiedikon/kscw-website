/**
 * Which text keys each page actually shows, in the order they appear on it.
 *
 * This is what makes /admin → Seitentexte a list of *pages* rather than a list of
 * 990 dictionary keys, and it is derived from the page sources at build time
 * instead of hand-curated: a page that gains a paragraph gains an editable field
 * in the admin on the next deploy, and a key that stops being used stops being
 * offered. A hand-written allowlist would have to be updated by the same person
 * the editor exists to keep out of the code.
 *
 * Values are deliberately absent — the admin UI already fetches
 * /js/i18n/{de,en}.json for those (both cached, both needed anyway), so shipping
 * them here too would double a 160 KB payload for nothing.
 */
import de from '../../public/js/i18n/de.json';

const dictionary = de as Record<string, string>;

const PAGE_SOURCES = import.meta.glob('./**/*.astro', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

// Header and Footer carry ~90 keys of their own (nav, dropdowns, footer columns)
// that belong to no single page. They are offered as their own groups rather than
// repeated under all 28 pages.
const COMPONENT_SOURCES = import.meta.glob('../components/*.astro', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

// The runtime layer renders a lot of text the visitor definitely reads — form
// validation, "Nachricht wird gesendet…", the calendar's empty state — and none of
// it appears in a page source, so scanning .astro files alone leaves ~100 editable
// strings unreachable. These need no build-time bake either: they are produced by
// window.i18n.t(), which consults the overrides directly, so listing them here is
// the whole change. Grouped per file; the text search is how an admin actually
// finds one of these.
const RUNTIME_SOURCES = import.meta.glob('../../public/js/*.js', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

export type KeyKind = 'text' | 'attr' | 'meta';

export interface ManifestKey {
  key: string;
  kind: KeyKind;
}

export interface ManifestGroup {
  id: string;
  kind: 'page' | 'component' | 'runtime' | 'other';
  /** Route for a page group, file name for a component or runtime group. */
  path: string;
  /** Key of the page's own H1, when it has one — the admin shows its German value as the group label. */
  labelKey?: string;
  keys: ManifestKey[];
}

/**
 * The admin edits the public site, not itself: admin.astro's own ~400 strings are
 * the tool's chrome, and an admin who renames "Save" to something else while
 * learning the editor has broken the thing they would use to undo it.
 */
const EXCLUDED_PAGES = new Set(['./admin.astro']);

/**
 * One pass over the source, so keys come out in the order a reader meets them.
 *
 * Five shapes carry a key today, all of them conventions this repo already
 * follows everywhere:
 *   data-i18n="k"                     — element text
 *   data-i18n-placeholder="k" etc.    — an attribute
 *   somethingKey="k"                  — a component/layout prop (titleKey, pageSubtitleKey, …)
 *   t(locale, 'k')                    — the build-time call, which feeds most props
 *   t('k') / i18n.t('k')              — the runtime call, in public/js and inline scripts
 *
 * The runtime form is loose enough to match something that is not a translation
 * call, so every key is checked against the dictionary before it is kept — which
 * is what makes a false positive harmless rather than a phantom row in the editor.
 */
const KEY_PATTERN = new RegExp([
  'data-i18n="(?<text>[^"]+)"',
  'data-i18n-(?:placeholder|title|aria-label|alt)="(?<attr>[^"]+)"',
  '(?<propName>[a-zA-Z]+)Key="(?<prop>[^"]+)"',
  't\\(locale,\\s*[\'"`](?<call>[^\'"`]+)[\'"`]',
  '\\bt\\(\\s*[\'"`](?<runtime>[^\'"`]+)[\'"`]',
].join('|'), 'g');

/**
 * Character ranges covered by the opening tag of a `*Layout` component.
 *
 * `titleKey` means two different things depending on who receives it: the document
 * <title> on PageLayout/BaseLayout, a section heading on SectionHeader. The prop
 * name alone cannot tell them apart, so position does — anything inside the layout's
 * own tag is page metadata, everything else is copy the visitor reads.
 */
function layoutTagRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of source.matchAll(/<[A-Z][A-Za-z]*Layout\b[\s\S]*?>/g)) {
    ranges.push([match.index!, match.index! + match[0].length]);
  }
  return ranges;
}

/**
 * Most specific evidence wins, regardless of where in the file it sits.
 *
 * One key is usually matched twice — `alt={t(locale, 'k')}` and `data-i18n-alt="k"`
 * on the same element — and the `t()` call comes first. Taking the first match's
 * kind would label every alt text and placeholder as ordinary copy, which is the
 * one thing the kind exists to distinguish.
 */
const KIND_RANK: Record<KeyKind, number> = { attr: 3, meta: 2, text: 1 };

function extractKeys(source: string): ManifestKey[] {
  const kinds = new Map<string, KeyKind>();
  const order: string[] = [];
  const layoutRanges = layoutTagRanges(source);
  const insideLayoutTag = (index: number) => layoutRanges.some(([from, to]) => index >= from && index < to);

  for (const match of source.matchAll(KEY_PATTERN)) {
    const g = match.groups!;
    const key = g.text || g.attr || g.prop || g.call || g.runtime;
    if (!key) continue;
    // Keys the dictionary does not have are computed at runtime (`'bb' + code`) or
    // simply dead; either way there is nothing to show a value for.
    if (!(key in dictionary)) continue;

    let kind: KeyKind = 'text';
    if (g.attr) kind = 'attr';
    else if (g.prop && (g.propName === 'title' || g.propName === 'description') && insideLayoutTag(match.index!)) {
      kind = 'meta';
    }

    const known = kinds.get(key);
    if (known === undefined) { order.push(key); kinds.set(key, kind); }
    else if (KIND_RANK[kind] > KIND_RANK[known]) kinds.set(key, kind);
  }

  return order.map((key) => ({ key, kind: kinds.get(key)! }));
}

/** './volleyball/spielplanung.astro' → '/volleyball/spielplanung'; './index.astro' → '/' */
function routeOf(globPath: string): string {
  const route = globPath.replace(/^\./, '').replace(/\.astro$/, '').replace(/\/index$/, '');
  return route === '' ? '/' : route;
}

function buildGroups(): ManifestGroup[] {
  const pages: ManifestGroup[] = [];

  for (const [globPath, source] of Object.entries(PAGE_SOURCES)) {
    if (EXCLUDED_PAGES.has(globPath)) continue;
    const keys = extractKeys(source);
    if (!keys.length) continue;

    const labelKey = source.match(/pageTitleKey="([^"]+)"/)?.[1];
    const path = routeOf(globPath);
    pages.push({
      id: path,
      kind: 'page',
      path,
      ...(labelKey && labelKey in dictionary ? { labelKey } : {}),
      keys,
    });
  }

  const components: ManifestGroup[] = [];
  for (const [globPath, source] of Object.entries(COMPONENT_SOURCES)) {
    const name = globPath.split('/').pop()!.replace(/\.astro$/, '');
    // A component that only forwards props (SectionHeader renders data-i18n={titleKey})
    // drops out on its own: there is no literal key in its source to match, and the
    // keys it renders are already listed under the pages that pass them in.
    const keys = extractKeys(source);
    if (!keys.length) continue;

    components.push({ id: `component:${name}`, kind: 'component', path: name, keys });
  }

  const runtime: ManifestGroup[] = [];
  for (const [globPath, source] of Object.entries(RUNTIME_SOURCES)) {
    const name = globPath.split('/').pop()!.replace(/\.js$/, '');
    // Vendored third-party bundles and the i18n engine itself hold no page copy.
    if (name === 'i18n' || globPath.includes('/vendor/')) continue;
    const keys = extractKeys(source);
    if (!keys.length) continue;

    runtime.push({ id: `runtime:${name}`, kind: 'runtime', path: name, keys });
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  components.sort((a, b) => a.path.localeCompare(b.path));
  runtime.sort((a, b) => a.path.localeCompare(b.path));
  const grouped = [...pages, ...components, ...runtime];

  /**
   * Everything the scans above cannot attribute to a page.
   *
   * Two kinds of key end up here. Most are built dynamically and are invisible to
   * any static scan — `t('pos' + player.position)` in team-page.js produces
   * posSetter/posLibero/… from data, so the key literal exists nowhere in the
   * source. The rest are simply unused leftovers.
   *
   * Offering them in one honest bucket beats the alternative: a visitor-visible
   * string (a roster column heading, a position name) that the editor silently
   * cannot reach, with nothing to tell the admin why. Searching the German text
   * finds them, which is how anyone would look. Editing a leftover key changes
   * nothing on the site, which is harmless.
   */
  const attributed = new Set(grouped.flatMap((g) => g.keys.map((k) => k.key)));
  const remaining = Object.keys(dictionary)
    .filter((key) => !attributed.has(key))
    .sort()
    .map((key): ManifestKey => ({ key, kind: 'text' }));

  if (remaining.length) {
    grouped.push({ id: 'other', kind: 'other', path: 'other', keys: remaining });
  }

  return grouped;
}

export function GET() {
  const groups = buildGroups();
  const keyCount = groups.reduce((n, g) => n + g.keys.length, 0);

  return new Response(JSON.stringify({ groups, keyCount }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Rebuilt with the site, and only the admin reads it.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
