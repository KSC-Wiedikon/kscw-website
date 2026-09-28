/**
 * The registration form shows the applicant what a season will cost — and it
 * only shows them the teams they can actually join.
 *
 * Fee table. The club's fee engine (wiedisync kscw-endpoints/clubdesk-update.js:
 * feeBreakdown) has three rules the form never mentioned: an adult — or a youth
 * player who is U16+ — without a scorer licence pays CHF 100 on top; a guest
 * pays CHF 110 less and never the surcharge; a coach pays nothing. Applicants
 * learned all three from their first invoice. The table under the consent box
 * exists so the number on the form is the number on the invoice; these tests
 * pin it against the engine's own constants, per category tier.
 *
 * Team list. populateTeams() filters a *player's* teams by the sex they picked
 * (D-teams for weiblich, H-teams for männlich, Mixed leagues for both) while a
 * coach, TR or guest sees every team. That filter silently decides which teams
 * an applicant can even pick, and a wrong heuristic (HU12 is a co-ed Mixed
 * league despite the H) hides a team without any error — so it is pinned here
 * with a fixed roster rather than whatever Directus lists this season.
 *
 * Directus and Turnstile are stubbed before navigation: the assertions are on
 * the form's arithmetic and filtering, not on the live data.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoWithLang, switchLangTo } from './helpers';

const PATH = '/weiteres/anmeldung';

// Same shape as `/items/teams?fields=id,name,league`; `sport` is only for the
// stub's own filtering. Volleyball names follow the D/H convention the gender
// heuristic reads; the basketball rows include the two co-ed Mixed leagues.
const TEAMS = [
  { id: 1, sport: 'volleyball', name: 'D1', league: '2L' },
  { id: 2, sport: 'volleyball', name: 'D2', league: '3L' },
  { id: 3, sport: 'volleyball', name: 'DU20', league: 'DU20' },
  { id: 4, sport: 'volleyball', name: 'H1', league: '2L' },
  { id: 5, sport: 'volleyball', name: 'H3', league: '2L' },
  { id: 6, sport: 'volleyball', name: 'HU20', league: 'U20 Ligamodus' },
  { id: 7, sport: 'volleyball', name: 'Legends', league: '4L' },
  { id: 11, sport: 'basketball', name: 'Damen D-Classics 1LR', league: '1LR' },
  { id: 12, sport: 'basketball', name: 'DU14', league: 'U14F' },
  { id: 13, sport: 'basketball', name: 'Herren 1', league: '1LR' },
  { id: 14, sport: 'basketball', name: 'HU12', league: 'MixU12M' },
  { id: 15, sport: 'basketball', name: 'MU10', league: 'MixU10M' },
  { id: 16, sport: 'basketball', name: 'Lions D1', league: '2LR' },
];

// The U16+ gate is a birth-year band relative to the current year
// (isU16Plus: birthYear <= thisYear - 15), so the two probe dates are derived
// from the clock rather than written down — fixed years would flip the
// expected outcome the January after they were chosen.
const THIS_YEAR = new Date().getFullYear();
const DOB_ADULT = '1990-01-01';
const DOB_YOUTH_U16 = `${THIS_YEAR - 15}-01-01`;   // turns 15 this year → U16+
const DOB_YOUTH_UNDER = `${THIS_YEAR - 14}-01-01`; // one year younger → not yet
// Swiss Basketball prices the licence by SEASON age band (U14 = born
// season−13..season−12 per src/lib/birthYears.ts), so the basketball probe is
// derived from the season, not the calendar year. The PRICING season turns on
// 1 JULY (registration-fees.js seasonStartYear, audit 2026-09-28 F-56) — not the
// 1 August of birthYears.ts — so this must mirror that, or every July run fails.
const SEASON = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
const DOB_BB_U14 = `${SEASON - 13}-06-01`;         // oldest U14 Jahrgang → CHF 55, and never U16+ by calendar year

test.beforeEach(async ({ page }) => {
  // Routes match last-registered first: the Directus catch-all goes in before
  // the teams stub so the specific one wins.
  await page.route(/^https:\/\/directus(-dev)?\.kscw\.ch\//, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
  }));
  await page.route('**/items/teams**', (route) => {
    const sport = new URL(route.request().url()).searchParams.get('filter[sport][_eq]');
    const data = TEAMS.filter((t) => t.sport === sport).map(({ id, name, league }) => ({ id, name, league }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  // Turnstile never loads: the widget is irrelevant here and the third-party
  // script would only add network noise to every run.
  await page.route('**/challenges.cloudflare.com/**', (route) => route.abort());
});

// ── Form drivers ─────────────────────────────────────────────────────────────
// The radio-card and toggle-switch inputs are display:none / zero-sized by
// design, so Playwright cannot click them even with force — the wrapping
// <label> is the real control. Every driver asserts the resulting state so a
// silent mis-click fails here and not three assertions later.

async function pickType(page: Page, value: 'volleyball' | 'basketball' | 'passive') {
  const input = page.locator(`input[name="membership_type"][value="${value}"]`);
  await page.locator('label.radio-card').filter({ has: input }).click();
  await expect(input).toBeChecked();
}

async function setToggle(page: Page, selector: string, on: boolean) {
  const input = page.locator(selector);
  if ((await input.isChecked()) !== on) {
    await page.locator('label.toggle-label').filter({ has: input }).click();
  }
  await expect(input).toBeChecked({ checked: on });
}

async function pickRadioCard(page: Page, name: string, value: string) {
  const input = page.locator(`input[name="${name}"][value="${value}"]`);
  await page.locator('label.radio-card').filter({ has: input }).click();
  await expect(input).toBeChecked();
}

/** Opens the custom team dropdown (a button + absolutely positioned list) unless it is already open. */
async function openTeamList(page: Page, sport: 'vb' | 'bb') {
  const wrapper = page.locator(`#${sport}-team-wrapper`);
  await expect(wrapper).toBeVisible();
  if (!(await wrapper.evaluate((el) => el.classList.contains('open')))) {
    await page.locator(`#${sport}-team-trigger`).click();
  }
  await expect(page.locator(`#${sport}-team-dropdown`)).toBeVisible();
}

function teamOpt(page: Page, sport: 'vb' | 'bb', name: string) {
  return page.locator(`#${sport}-team .team-opt`).filter({ has: page.locator(`input[name="team_${sport}"][value="${name}"]`) });
}

async function expectTeams(page: Page, sport: 'vb' | 'bb', present: string[], absent: string[]) {
  await openTeamList(page, sport);
  for (const name of present) await expect(teamOpt(page, sport, name)).toBeVisible();
  for (const name of absent) await expect(teamOpt(page, sport, name)).toHaveCount(0);
}

const fee = {
  summary: (page: Page) => page.locator('#fee-summary'),
  membership: (page: Page) => page.locator('#fee-amount-membership'),
  licenceRow: (page: Page) => page.locator('#fee-row-licence'),
  licence: (page: Page) => page.locator('#fee-amount-licence'),
  surchargeRow: (page: Page) => page.locator('#fee-row-surcharge'),
  surcharge: (page: Page) => page.locator('#fee-amount-surcharge'),
  guestRow: (page: Page) => page.locator('#fee-row-guest'),
  guest: (page: Page) => page.locator('#fee-amount-guest'),
  total: (page: Page) => page.locator('#fee-amount-total'),
  coachNote: (page: Page) => page.locator('#fee-note-coach'),
  refereeNote: (page: Page) => page.locator('#fee-note-referee'),
};

// ── Team list: the gender filter ─────────────────────────────────────────────

test.describe('team list', () => {
  test('a player only sees the teams of their own sex — volleyball', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#geschlecht').selectOption('männlich');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    // Legends is a men's team without an H in the name — the heuristic knows it by name.
    await expectTeams(page, 'vb', ['H1', 'H3', 'HU20', 'Legends'], ['D1', 'D2', 'DU20']);

    // Changing sex re-filters in place; the list flips rather than growing.
    await page.locator('#geschlecht').selectOption('weiblich');
    await expectTeams(page, 'vb', ['D1', 'D2', 'DU20'], ['H1', 'H3', 'HU20', 'Legends']);
  });

  test('a player only sees the teams of their own sex — basketball, Mixed leagues for everyone', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'basketball');
    await page.locator('#geschlecht').selectOption('männlich');
    await page.locator('#funktion-bb').selectOption('Spieler*in');
    // HU12 reads as a boys' team by name but its league is MixU12M — the league
    // label wins, so it stays visible to both sexes alongside MU10.
    await expectTeams(page, 'bb', ['Herren 1', 'HU12', 'MU10'], ['Lions D1', 'Damen D-Classics 1LR', 'DU14']);

    await page.locator('#geschlecht').selectOption('weiblich');
    await expectTeams(page, 'bb', ['Lions D1', 'Damen D-Classics 1LR', 'DU14', 'HU12', 'MU10'], ['Herren 1']);
  });

  test('a coach or guest sees every team regardless of sex', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#geschlecht').selectOption('männlich');

    await page.locator('#funktion-vb').selectOption('Trainer*in');
    await expectTeams(page, 'vb', ['D1', 'H1'], []);

    await page.locator('#funktion-vb').selectOption('Guest');
    await expectTeams(page, 'vb', ['D1', 'H1'], []);
  });
});

// ── Fee table ────────────────────────────────────────────────────────────────

test.describe('fee table', () => {
  test('nothing is shown until a category is chosen', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await expect(fee.summary(page)).toBeHidden();
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await expect(fee.summary(page)).toBeHidden();
  });

  test('adult volleyball player: licence split out, surcharge until a scorer licence or the whistle', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');

    // CHF 440 = 330 club fee + 110 Swiss Volley licence — a split, not an addition.
    await expect(fee.summary(page)).toBeVisible();
    await expect(fee.membership(page)).toHaveText('CHF 330');
    await expect(fee.licenceRow(page)).toBeVisible();
    await expect(fee.licence(page)).toHaveText('CHF 110');
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.surcharge(page)).toHaveText('CHF 100');
    await expect(fee.guestRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 540');
    await expect(fee.coachNote(page)).toBeHidden();
    await expect(fee.refereeNote(page)).toBeHidden();

    // A scorer licence waives the surcharge.
    await setToggle(page, 'input[name="lizenz_vb"][value="Schreiber"]', true);
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 440');

    // …and comes back when it is switched off again.
    await setToggle(page, 'input[name="lizenz_vb"][value="Schreiber"]', false);
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 540');

    // A referee fulfils the officials duty: no surcharge, plus the waiver note.
    await setToggle(page, '#vb-ref-check', true);
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 440');
    await expect(fee.refereeNote(page)).toBeVisible();
  });

  test('youth categories: the surcharge starts at U16, intro tiers never pay it', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await page.locator('#vb-fee').selectOption('VB Schüler*in Meisterschaft');

    await page.locator('#geburtsdatum').fill(DOB_YOUTH_UNDER);
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 310');

    await page.locator('#geburtsdatum').fill(DOB_YOUTH_U16);
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 410');

    // The KWI tournament tier is an intro tier: no surcharge at any age.
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await page.locator('#vb-fee').selectOption('VB Turnier KWI');
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 110');
  });

  test('guest: CHF 110 off, no surcharge, no intro tier, and the labels say so', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await page.locator('#funktion-vb').selectOption('Guest');

    // The intro tier is not a guest option — hidden AND disabled, because Safari
    // ignores `hidden` on <option>.
    const kwi = page.locator('#vb-fee option[value="VB Turnier KWI"]');
    await expect(kwi).toBeDisabled();
    await expect(kwi).toHaveAttribute('hidden');
    const working = page.locator('#vb-fee option[value="VB Erwerbstätige"]');
    await expect(working).toBeEnabled();
    await expect(working).toHaveText(/als Gast/);
    await expect(working).toContainText('CHF 330');

    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');
    await expect(fee.guestRow(page)).toBeVisible();
    await expect(fee.guest(page)).toHaveText('− CHF 110');
    await expect(fee.surchargeRow(page)).toBeHidden();
    // No licence line for a guest (finance.js: the reduction IS the licence
    // coming off), so line 1 is the full base.
    await expect(fee.licenceRow(page)).toBeHidden();
    await expect(fee.membership(page)).toHaveText('CHF 440');
    await expect(fee.total(page)).toHaveText('CHF 330');

    // Back to player: the tier and the plain labels return, and the same
    // category now carries the surcharge again.
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await expect(kwi).toBeEnabled();
    await expect(kwi).not.toHaveAttribute('hidden');
    await expect(working).not.toHaveText(/als Gast/);
    await expect(working).toContainText('CHF 440');
    await expect(page.locator('#vb-fee')).toHaveValue('VB Erwerbstätige');
    await expect(fee.guestRow(page)).toBeHidden();
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 540');
  });

  test('a referee tick made as a player does not follow the applicant into guest mode', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await setToggle(page, '#vb-ref-check', true);
    await expect(fee.refereeNote(page)).toBeVisible();

    // The toggle is hidden for a guest AND cleared: the engine has no referee
    // rule for a guest (base − 110, full stop), so the note must not linger
    // under a guest total with no visible control that explains it.
    await page.locator('#funktion-vb').selectOption('Guest');
    await expect(page.locator('#vb-ref-check')).not.toBeChecked();
    await expect(fee.refereeNote(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 330');

    // Back to player: the whistle has to be ticked again, so the surcharge is due.
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await expect(page.locator('#vb-ref-check')).not.toBeChecked();
    await expect(fee.refereeNote(page)).toBeHidden();
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 540');
  });

  test('coach: category forced to Gratis, total CHF 0, waiver note', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Trainer*in');

    await expect(page.locator('#vb-fee')).toHaveValue('Gratis');
    const enabled = page.locator('#vb-fee option:not([disabled])');
    await expect(enabled).toHaveCount(1);
    await expect(enabled).toHaveAttribute('value', 'Gratis');
    await expect(fee.summary(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 0');
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.coachNote(page)).toBeVisible();
  });

  test('basketball: Swiss Basketball licence by age, Offiziellen wording, surcharge waived by an OTR licence', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'basketball');
    await page.locator('#funktion-bb').selectOption('Spieler*in');
    await page.locator('#bb-fee').selectOption('BB Erwerbstätige');

    // Without a birthdate the licence band is unknown: one line, nothing guessed.
    await expect(fee.summary(page)).toBeVisible();
    await expect(fee.membership(page)).toHaveText('CHF 520');
    await expect(fee.licenceRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 620');

    // Adult → Regionale Senioren CHF 150 (2026/27 sheet), carved out of the 520.
    await page.locator('#geburtsdatum').fill(DOB_ADULT);
    await expect(fee.membership(page)).toHaveText('CHF 370');
    await expect(fee.licenceRow(page)).toBeVisible();
    // Both sports' labels sit in the markup; only the basketball ones may show.
    await expect(fee.licenceRow(page).locator('.fee-bb')).toHaveText('Swiss Basketball Lizenz');
    await expect(fee.licenceRow(page).locator('.fee-vb')).toBeHidden();
    await expect(fee.licence(page)).toHaveText('CHF 150');
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.surchargeRow(page).locator('span.fee-bb')).toHaveText('Zuschlag ohne Offiziellen-Lizenz (OTR/OTN)');
    await expect(fee.surchargeRow(page).locator('small.fee-bb')).toContainText('Tischoffiziellen-Lizenz (OTR 1, OTR 2 oder OTN)');
    for (const el of await fee.surchargeRow(page).locator('.fee-vb').all()) await expect(el).toBeHidden();
    await expect(fee.surcharge(page)).toHaveText('CHF 100');
    await expect(fee.total(page)).toHaveText('CHF 620');

    await pickRadioCard(page, 'bb_scorer_licence', 'OTR 1');
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 520');

    // "none" is a real radio with an empty value — it must not count as a licence.
    await pickRadioCard(page, 'bb_scorer_licence', '');
    await expect(fee.surchargeRow(page)).toBeVisible();
    await expect(fee.total(page)).toHaveText('CHF 620');
  });

  test('basketball youth: the licence follows the age band, the surcharge the U16 gate', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'basketball');
    await page.locator('#funktion-bb').selectOption('Spieler*in');
    await page.locator('#geburtsdatum').fill(DOB_BB_U14);
    await page.locator('#bb-fee').selectOption('BB Jugend Meisterschaft');

    // U14 → CHF 55 of the 320; under the U16 gate → no surcharge.
    await expect(fee.membership(page)).toHaveText('CHF 265');
    await expect(fee.licence(page)).toHaveText('CHF 55');
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 320');

    // The sport's wording goes back to volleyball's when the sport does.
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Spieler*in');
    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');
    await expect(fee.licenceRow(page).locator('.fee-vb')).toHaveText('Swiss Volley Lizenz');
    await expect(fee.licenceRow(page).locator('.fee-bb')).toBeHidden();
    await expect(fee.surchargeRow(page).locator('span.fee-vb')).toHaveText('Zuschlag ohne Schreiberlizenz');
    await expect(fee.surchargeRow(page).locator('span.fee-bb')).toBeHidden();
  });

  test('passive: flat fee, nothing else on the table', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'passive');
    await page.locator('#passive-fee').selectOption('Passivmitglied');
    await expect(fee.summary(page)).toBeVisible();
    await expect(fee.membership(page)).toHaveText('CHF 40');
    await expect(fee.licenceRow(page)).toBeHidden();
    await expect(fee.surchargeRow(page)).toBeHidden();
    await expect(fee.guestRow(page)).toBeHidden();
    await expect(fee.total(page)).toHaveText('CHF 40');

    await page.locator('#passive-fee').selectOption('Gratis');
    await expect(fee.total(page)).toHaveText('CHF 0');
  });
});

// ── Language ─────────────────────────────────────────────────────────────────
// The guest relabel swaps the option's data-i18n key rather than writing bare
// text (CLAUDE.md load-order rule 3), so the toggle must re-apply it. On mobile
// the language toggle leaves the hamburger menu open over the form, so each
// test switches language LAST and only reads afterwards.

test.describe('language', () => {
  test('English labels and table title, loaded in English', async ({ page }) => {
    await gotoWithLang(page, PATH, 'en');
    await expect(page.locator('#vb-fee option[value="VB Erwerbstätige"]')).toHaveText('VB Working Adults (CHF 440)');
    await expect(page.locator('#vb-fee option[value="VB Schüler*in Turnier"]')).toHaveText('VB High School Student Tournament (CHF 210)');
    // Basketball carries the same sport prefix as volleyball.
    await expect(page.locator('#bb-fee option[value="BB Erwerbstätige"]')).toHaveText('BB Working Adults (CHF 520)');
    await expect(page.locator('#bb-fee option[value="BB Minis Turnier"]')).toHaveText('BB Minis Tournament — up to U12 (CHF 220)');

    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Guest');
    await expect(page.locator('#vb-fee option[value="VB Erwerbstätige"]')).toHaveText('VB Working Adults — as Guest (CHF 330)');
    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');
    await expect(page.locator('#fee-summary .fee-summary-title')).toHaveText('Your Fees per Season');
    await expect(fee.total(page)).toHaveText('CHF 330');
  });

  test('a guest relabel survives the language toggle', async ({ page }) => {
    await gotoWithLang(page, PATH, 'de');
    await pickType(page, 'volleyball');
    await page.locator('#funktion-vb').selectOption('Guest');
    await page.locator('#vb-fee').selectOption('VB Erwerbstätige');
    await expect(page.locator('#vb-fee option[value="VB Erwerbstätige"]')).toHaveText('VB Erwerbstätige — als Gast (CHF 330)');
    await expect(page.locator('#fee-summary .fee-summary-title')).toHaveText('Dein Beitrag pro Saison');

    await switchLangTo(page, 'en');
    await expect(page.locator('#vb-fee option[value="VB Erwerbstätige"]')).toHaveText('VB Working Adults — as Guest (CHF 330)');
    // Every category a guest may pick is relabelled, the youth tier included.
    await expect(page.locator('#vb-fee option[value="VB Schüler*in Turnier"]')).toHaveText('VB High School Student Tournament — as Guest (CHF 100)');
    // The intro tier is hidden for guests and has no guest key — it keeps the
    // plain label, which the toggle must still translate.
    await expect(page.locator('#vb-fee option[value="VB Turnier KWI"]')).toHaveText('VB Tournament KWI (CHF 110)');
    await expect(page.locator('#fee-summary .fee-summary-title')).toHaveText('Your Fees per Season');
    // Amounts are JS-written numbers, not dictionary strings — the swap leaves them alone.
    await expect(fee.total(page)).toHaveText('CHF 330');
  });
});
