#!/usr/bin/env node
/**
 * Bakes the admin's page-text overrides into the build.
 *
 * The dictionaries in `public/js/i18n/` stay the source of truth for every
 * string on the site. This script fetches the *overrides* an admin has saved in
 * Directus (`/kscw/site-text`) and freezes them into `src/generated/site-text.json`,
 * which `src/lib/i18n.ts` layers on top of the German render at build time. The
 * browser applies the same overrides at runtime (`public/js/i18n.js`), so an edit
 * is visible in seconds; this step is what makes it visible to a crawler, and what
 * removes the flash of pre-edit German on the next rebuild.
 *
 * Runs as `prebuild`/`predev`/`pretest`, so `npm run build` picks it up on
 * Cloudflare Pages with no extra configuration.
 *
 * It must never fail a build. Directus being unreachable is not a reason for the
 * website to stop deploying, so every failure path keeps whatever is already on
 * disk and exits 0 — the last known overrides, or the empty file that is
 * committed. The repo dictionaries alone always render a complete site.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'src/generated/site-text.json')
const LANGS = ['de', 'en']

// Mirrors src/lib/directus.ts's server-side fallback, so the build talks to the
// same Directus the Astro frontmatter fetches do.
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://directus.kscw.ch'
const TIMEOUT_MS = 10_000

/** `{count}`-style placeholders, which an override has to carry over from the default. */
export function placeholders(value) {
  return new Set(String(value).match(/\{[a-zA-Z0-9_]+\}/g) || [])
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

function warn(msg) {
  console.warn(`[site-text] ${msg}`)
}

/**
 * Keep only overrides that are safe and meaningful to ship.
 *
 * The write path in Directus (`kscw-endpoints/src/site-text.js`) is the authority
 * on shape — type, length, control characters, key format. This is the second,
 * *semantic* gate, and it lives here because this is where the dictionaries are:
 * only here can we tell that an override targets a real key and still carries the
 * placeholders the code interpolates into it. Dropping a bad row degrades to the
 * repo's own text, which is always a correct page.
 */
export function sanitize(raw, dicts) {
  const clean = { de: {}, en: {} }
  let dropped = 0

  for (const lang of LANGS) {
    const incoming = raw?.[lang]
    if (!incoming || typeof incoming !== 'object') continue

    for (const [key, value] of Object.entries(incoming)) {
      const fallback = dicts[lang][key]

      if (typeof value !== 'string' || value.trim() === '') {
        warn(`dropped ${lang}.${key}: not a non-empty string`); dropped++; continue
      }
      if (fallback === undefined) {
        warn(`dropped ${lang}.${key}: no such key in ${lang}.json`); dropped++; continue
      }
      // Same invariant tests/unit/no-i18n-html.test.ts pins on the dictionaries:
      // translated values are applied as text, never parsed as markup. A value
      // with a tag in it means something upstream is wrong — refuse it.
      if (value.includes('<')) {
        warn(`dropped ${lang}.${key}: contains "<"`); dropped++; continue
      }
      if (!sameSet(placeholders(value), placeholders(fallback))) {
        warn(`dropped ${lang}.${key}: placeholders differ from the default`); dropped++; continue
      }
      // An override identical to the default is dead weight in every page's build.
      if (value === fallback) continue

      clean[lang][key] = value
    }
  }

  return { clean, dropped }
}

/** Stable key order so a rebuild with unchanged overrides produces an identical file. */
function serialize(obj) {
  const sorted = {}
  for (const lang of LANGS) {
    sorted[lang] = {}
    for (const key of Object.keys(obj[lang]).sort()) sorted[lang][key] = obj[lang][key]
  }
  return JSON.stringify(sorted, null, 2) + '\n'
}

async function main() {
  const dicts = {}
  for (const lang of LANGS) {
    dicts[lang] = JSON.parse(readFileSync(resolve(ROOT, `public/js/i18n/${lang}.json`), 'utf8'))
  }

  let payload
  try {
    const res = await fetch(`${DIRECTUS_URL}/kscw/site-text`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    payload = await res.json()
  } catch (err) {
    // Includes the 404 you get before the Directus extension is deployed, which is
    // the expected state on a fresh checkout — not worth a scary message.
    warn(`keeping the overrides already on disk (${err.message})`)
    return
  }

  const { clean, dropped } = sanitize(payload, dicts)
  const next = serialize(clean)

  let current = ''
  try { current = readFileSync(OUT, 'utf8') } catch { /* first run */ }
  if (current === next) {
    console.log('[site-text] overrides unchanged')
    return
  }

  writeFileSync(OUT, next, 'utf8')
  const counts = LANGS.map((l) => `${Object.keys(clean[l]).length} ${l}`).join(', ')
  console.log(`[site-text] baked ${counts}${dropped ? ` (${dropped} dropped)` : ''}`)
}

// Only fetch when actually run as a script. The rules above are imported by
// tests/unit/site-text.test.ts, which must not hit the network to check them.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((err) => {
    // Belt and braces: a bug in this script must not take the deploy down with it.
    warn(`unexpected failure, keeping existing overrides (${err.message})`)
  })
}
