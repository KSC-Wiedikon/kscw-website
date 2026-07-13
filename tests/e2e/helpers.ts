import type { Page } from '@playwright/test';

export type Lang = 'de' | 'en';

/**
 * Single-URL site: the language is NOT in the path. Every page has one canonical
 * (German-slug) URL; German is server-rendered and English is swapped in
 * client-side by public/js/i18n.js, which reads the choice from localStorage
 * (`kscw-locale`) and otherwise falls back to the browser language.
 *
 * Two consequences for tests:
 *  - The legacy /de/… and /en/… URLs only exist as 301s in public/_redirects,
 *    which is Cloudflare-only — `astro preview` serves plain 404s for them, so
 *    tests must use the canonical path.
 *  - Without a stored choice the language follows the browser locale, and
 *    Playwright's default is en-US — an unseeded page renders ENGLISH. Any
 *    assertion on German copy has to ask for 'de' explicitly.
 */
export async function gotoWithLang(page: Page, path: string, lang: Lang = 'de') {
  // Store the choice exactly like the header toggle does, then load the page.
  // Deliberately NOT page.addInitScript: an init script re-runs on every
  // subsequent navigation, so it would silently overwrite a language the test
  // picked via the toggle and make "the choice is remembered" untestable.
  if (!page.url().startsWith('http')) await page.goto(path); // establish the origin
  await page.evaluate((l) => {
    try { localStorage.setItem('kscw-locale', l); } catch { /* private mode */ }
  }, lang);
  await page.goto(path);
  await waitForI18n(page);
}

/** Resolves once public/js/i18n.js has applied the translations for this load. */
export async function waitForI18n(page: Page) {
  await page.waitForFunction(() => 'i18nReady' in window);
  await page.evaluate(() => (window as unknown as { i18nReady: Promise<string> }).i18nReady);
}

/**
 * Click the header language toggle — the only way to switch language on a
 * single-URL site — and wait for the swap to land. On mobile the toggle lives
 * inside the collapsed hamburger menu, so open that first.
 */
export async function switchLangTo(page: Page, lang: Lang) {
  const desktopBtn = page.locator(`.lang-btn[data-lang="${lang}"]`).first();
  if (await desktopBtn.isVisible()) {
    await desktopBtn.click();
  } else {
    // Mobile: open the hamburger menu only if it isn't already open — the menu
    // stays open after a language switch, and clicking the hamburger again
    // would close it and hide the toggle.
    const navOpen = await page.evaluate(() => document.body.classList.contains('nav-open'));
    if (!navOpen) await page.locator('.nav-hamburger').click();
    const mobileBtn = page.locator(`.lang-btn-mobile[data-lang="${lang}"]`).first();
    await mobileBtn.waitFor({ state: 'visible' });
    await mobileBtn.click();
  }
  await page.waitForFunction((l) => document.documentElement.lang === l, lang);
}
