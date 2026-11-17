import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Every spec imports `test` from here, not from '@playwright/test'.
 *
 * The site reports every failed fetch and console error to Directus
 * (public/js/error-logger.js, plus registration-form.js directly), and on
 * localhost that is the DEV backend. The suite fakes 500s, offline dictionaries
 * and refusals on purpose, so without this every run (local and the CI test job
 * of each deploy) wrote a few hundred fake entries into the dev error log a day,
 * burying the real ones.
 *
 * Swallowed at the context level so a spec can still assert on a report: a
 * `page.route('**\/kscw/client-error', …)` takes precedence over this one
 * (registration-refusals.spec.ts does exactly that).
 *
 * The route alone cannot catch everything: a beacon sent by a document that is
 * unloading (a test navigating away while a poll is in flight) is invisible to
 * Playwright. error-logger.js therefore sends nothing under automation
 * (navigator.webdriver) unless a page opts in with
 * window.__kscwReportUnderAutomation, which registration-refusals does.
 */
export async function muteErrorLog(target: BrowserContext | Page) {
  await target.route('**/kscw/client-error', (route) => route.fulfill({ status: 204 }));
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await muteErrorLog(context);
    // The hall-scoreboard feeds. The homepage tables and every team page wait for
    // live_history (pending-results.js) before they render, and live-now.js polls
    // live_scores every 30 s. Left to the real dev Directus, a slow answer under
    // parallel workers pushed those tests past their timeouts (1-3 failures per
    // run). Empty by default; a spec that needs live data routes it itself, and its
    // route wins (live.spec, cup-games, game-rows-kscw-side).
    const empty = { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) };
    await context.route('**/items/live_history**', (route) => route.fulfill(empty));
    await context.route('**/items/live_scores**', (route) => route.fulfill(empty));
    // The admin's page-text overrides. Dev holds real ones (homeSubtitle in both
    // languages on 17.11.2026), so whenever the overlay won the race the dictionary
    // copy the i18n specs expect was replaced and they failed at random. No
    // overrides by default; site-text-overlay.spec stubs its own.
    await context.route('**/kscw/site-text', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ de: {}, en: {} }),
    }));
    await use(context);
  },
});
// A page or context made by hand (`browser.newPage()` in an afterAll) does not go
// through this fixture: call muteErrorLog() on it yourself.

export { expect };
