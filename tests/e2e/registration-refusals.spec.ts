/**
 * A registration the browser refuses must never be silent.
 *
 * The browser validates every `required` field BEFORE the form's submit event
 * fires, so a refusal there never reached registration-form.js: no entry in the
 * error log, and the applicant's only hint was a small native bubble — or none
 * at all for a control that is not visible (the membership-type radios are
 * display:none cards). On 06.10.2026 a parent uploaded their child's documents,
 * reloaded, uploaded again and never got a submit through, with an empty log.
 *
 * Pinned here:
 *  - a browser-side refusal names the field(s) in the form's own feedback box,
 *    and reaches the error log once per distinct reason (not once per click);
 *  - leaving after an attempt sends one warn-level `registration_abandoned`
 *    entry with the state left behind; leaving an untouched form sends nothing.
 *
 * Directus and Turnstile are stubbed. The leave report is triggered by
 * dispatching `pagehide` on the live page: Playwright cannot intercept a beacon
 * sent by a document that is unloading, so a real navigation would make the
 * report unobservable here — delivery on unload is sendBeacon's own contract,
 * the same one error-logger.js relies on.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const PATH = '/weiteres/anmeldung';

type Report = { event?: string; level?: string; error?: string };

async function stubBackend(context: BrowserContext): Promise<Report[]> {
  const reports: Report[] = [];
  await context.route(/^https:\/\/directus(-dev)?\.kscw\.ch\//, (route) => {
    if (new URL(route.request().url()).pathname === '/kscw/client-error') {
      try { reports.push(JSON.parse(route.request().postData() || '{}')); } catch { /* not JSON */ }
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await context.route('**/challenges.cloudflare.com/**', (route) => route.abort());
  return reports;
}

const leave = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));

const refusals = (reports: Report[]) =>
  reports.filter((r) => (r.error || '').startsWith('[registration] blocked by browser check:'));

test('an empty submit names the missing fields and is logged once', async ({ page, context }) => {
  const reports = await stubBackend(context);
  await gotoWithLang(page, PATH, 'de');

  const submit = page.locator('#registration-form button[type=submit]');
  await submit.click();

  const feedback = page.locator('#form-feedback');
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText('Das Formular kann noch nicht gesendet werden');
  // The radio group is named by its heading, not by an option card.
  await expect(feedback).toContainText('Mitgliedschaftsart');
  await expect(feedback).not.toContainText('Volleyball');

  await expect.poll(() => refusals(reports).length).toBe(1);
  const first = refusals(reports)[0];
  expect(first.event).toBe('console_error');
  // The hidden radio is the case the browser cannot show a bubble for.
  expect(first.error).toContain('membership_type (valueMissing, hidden)');
  expect(first.error).toContain('vorname (valueMissing)');
  expect(first.error).not.toMatch(/membership_type.*membership_type/);

  // Hammering the button with nothing changed does not spend the log budget.
  await submit.click();
  await submit.click();
  await page.waitForTimeout(300);
  expect(refusals(reports)).toHaveLength(1);
});

test('leaving after a refused attempt reports where the applicant was stuck', async ({ page, context }) => {
  const reports = await stubBackend(context);
  await gotoWithLang(page, PATH, 'de');

  await page.locator('label:has(input[name="membership_type"][value="volleyball"])').click();
  await page.fill('#vorname', 'Probe');
  await page.locator('#registration-form button[type=submit]').click();
  await expect(page.locator('#form-feedback')).toBeVisible();

  await leave(page);

  await expect.poll(() => reports.filter((r) => r.event === 'registration_abandoned').length).toBe(1);
  const left = reports.find((r) => r.event === 'registration_abandoned')!;
  expect(left.level).toBe('warn');
  expect(left.error).toContain('type: volleyball');
  expect(left.error).toContain('submit attempts: 1');
  expect(left.error).toContain('last refusal: blocked by browser check:');
  expect(left.error).toContain('still invalid: ');
  expect(left.error).toContain('nachname');
  // Ids and counts only — never what the applicant typed.
  expect(left.error).not.toContain('Probe');
});

test('leaving an untouched form reports nothing', async ({ page, context }) => {
  const reports = await stubBackend(context);
  await gotoWithLang(page, PATH, 'de');
  await page.locator('label:has(input[name="membership_type"][value="basketball"])').click();
  await leave(page);
  await page.waitForTimeout(500);
  expect(reports.filter((r) => r.event === 'registration_abandoned')).toHaveLength(0);
});
