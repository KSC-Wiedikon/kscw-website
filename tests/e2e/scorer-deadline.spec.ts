// Drives the real built page with a stubbed Directus response to see what the
// card actually renders on each side of the deadline.
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang } from './helpers';

const COURSE = (extra: Record<string, unknown>) => ({
  slug_id: 'x', title_de: 'Volleyball-Schreiberkurs', title_en: 'Volleyball scorer course',
  date_iso: '2030-08-19', time: '18:00', mode: 'in_person',
  form_slug_de: 'scorercourse-de-2026', form_slug_en: null,
  location: 'Sportanlage Irchel', host_note: 'Powered by KSC Wiedikon',
  duration_hours: 4, sort: 0, ...extra,
});

async function stub(page: Page, rows: unknown[]) {
  await page.route('**/items/scorer_courses**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows }) }));
}

test('deadline ahead → shows until-line and keeps the sign-up button', async ({ page }) => {
  await stub(page, [COURSE({ registration_closes: '2030-08-11T22:00:00+00:00' })]);
  await gotoWithLang(page, '/weiteres/schreiberkurse', 'de');
  const card = page.locator('[data-scorer-courses] .card').first();
  await expect(card).toBeVisible();
  // 22:00Z in August = 00:00 the next day in Zurich (CEST).
  await expect(card.locator('.scorer-deadline')).toHaveText('Anmeldung möglich bis 12.08.2030 00:00');
  await expect(card.getByRole('link', { name: /Zur Anmeldung/ })).toBeVisible();
  await expect(card.locator('.scorer-closed')).toHaveCount(0);
});

test('until-line follows the language toggle', async ({ page }) => {
  await stub(page, [COURSE({ registration_closes: '2030-08-11T22:00:00+00:00' })]);
  await gotoWithLang(page, '/weiteres/schreiberkurse', 'en');
  const card = page.locator('[data-scorer-courses] .card').first();
  // Date stays dd.mm.yyyy in English — de-CH formatting regardless of UI language.
  await expect(card.locator('.scorer-deadline')).toHaveText('Sign-ups possible until 12.08.2030 00:00');
});

test('deadline passed → locks: no sign-up button, closed note, calendar kept', async ({ page }) => {
  await stub(page, [COURSE({ registration_closes: '2020-01-01T00:00:00+00:00' })]);
  await gotoWithLang(page, '/weiteres/schreiberkurse', 'de');
  const card = page.locator('[data-scorer-courses] .card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.scorer-closed')).toHaveText(/Anmeldung geschlossen/);
  await expect(card.getByRole('link', { name: /Zur Anmeldung/ })).toHaveCount(0);
  // Locked, not hidden: the details and calendar link survive.
  await expect(card.getByRole('link', { name: /Kalender/ })).toBeVisible();
  await expect(card).toContainText('Sportanlage Irchel');
  await expect(card.locator('.scorer-deadline')).toHaveCount(0);
});

test('no deadline → unchanged, no until-line', async ({ page }) => {
  await stub(page, [COURSE({ registration_closes: null })]);
  await gotoWithLang(page, '/weiteres/schreiberkurse', 'de');
  const card = page.locator('[data-scorer-courses] .card').first();
  await expect(card.getByRole('link', { name: /Zur Anmeldung/ })).toBeVisible();
  await expect(card.locator('.scorer-deadline')).toHaveCount(0);
  await expect(card.locator('.scorer-closed')).toHaveCount(0);
});
