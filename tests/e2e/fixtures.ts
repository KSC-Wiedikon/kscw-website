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
    await use(context);
  },
});
// A page or context made by hand (`browser.newPage()` in an afterAll) does not go
// through this fixture: call muteErrorLog() on it yourself.

export { expect };
