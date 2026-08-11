/**
 * The half of the page-text editor that only exists in a browser: an override
 * saved in /admin has to appear on the public site within seconds, *without* a
 * rebuild — including in German, which normally gets no DOM pass at all because it
 * is server-rendered (see init() in public/js/i18n.js).
 *
 * Directus is stubbed here rather than called. That is the point: these tests pin
 * the contract between the endpoint's response shape and the overlay, so a change
 * to either side fails locally instead of on the live site. The failure paths
 * matter just as much — the page must be complete and readable when the overlay
 * never arrives, which is the state every visitor is in today.
 */
import { test, expect } from '@playwright/test';
import { gotoWithLang, switchLangTo, waitForI18n } from './helpers';

const PAGE = '/volleyball/spielplanung';
const KEY = 'schedulingSaturdaysText';
const OVERLAY = '**/kscw/site-text';

const DE_OVERRIDE = 'Zu Testzwecken geänderter Spielsamstag-Text.';
const EN_OVERRIDE = 'Test-only game Saturday text.';

/** Stub the overlay endpoint with an arbitrary payload. */
async function stubOverlay(page: import('@playwright/test').Page, body: unknown, status = 200) {
  await page.route(OVERLAY, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }));
}

const paragraph = (page: import('@playwright/test').Page) =>
  page.locator(`[data-i18n="${KEY}"]`).first();

test.describe('page-text overlay', () => {
  test('a German override replaces the server-rendered text', async ({ page }) => {
    await stubOverlay(page, { de: { [KEY]: DE_OVERRIDE }, en: {} });
    await gotoWithLang(page, PAGE, 'de');

    // German is built into the HTML, so this only passes if the overlay patched it.
    await expect(paragraph(page)).toHaveText(DE_OVERRIDE);
  });

  test('an English override survives the language toggle', async ({ page }) => {
    await stubOverlay(page, { de: { [KEY]: DE_OVERRIDE }, en: { [KEY]: EN_OVERRIDE } });
    await gotoWithLang(page, PAGE, 'de');
    await expect(paragraph(page)).toHaveText(DE_OVERRIDE);

    // The English swap runs a full applyTranslations() pass; the override has to
    // win there too, not just in the targeted patch.
    await switchLangTo(page, 'en');
    await expect(paragraph(page)).toHaveText(EN_OVERRIDE);

    await switchLangTo(page, 'de');
    await expect(paragraph(page)).toHaveText(DE_OVERRIDE);
  });

  test('a key with no override keeps the wording the site was built with', async ({ page }) => {
    await stubOverlay(page, { de: { [KEY]: DE_OVERRIDE }, en: {} });
    await gotoWithLang(page, PAGE, 'de');
    await expect(paragraph(page)).toHaveText(DE_OVERRIDE);

    // Same page, a different key — untouched.
    await expect(page.locator('[data-i18n="schedulingIntroText1"]').first())
      .toContainText('Spielplanung des KSC Wiedikon');
  });

  test('an override carrying markup is refused', async ({ page }) => {
    // Belt-and-braces: the endpoint and the database both refuse "<" already. If a
    // value ever gets past them, the browser must not apply it.
    await stubOverlay(page, { de: { [KEY]: 'Text mit <b>Markup</b>' }, en: {} });
    await gotoWithLang(page, PAGE, 'de');

    await expect(paragraph(page)).not.toContainText('Markup');
    // And nothing was injected as an element.
    expect(await page.locator(`[data-i18n="${KEY}"] b`).count()).toBe(0);
  });

  test('a key that could widen the selector is ignored', async ({ page }) => {
    await stubOverlay(page, {
      de: { 'a"],[data-i18n]': 'überschreibt alles', [KEY]: DE_OVERRIDE },
      en: {},
    });
    await gotoWithLang(page, PAGE, 'de');

    await expect(paragraph(page)).toHaveText(DE_OVERRIDE);
    // The malformed key must not have swept every translated node on the page.
    await expect(page.locator('[data-i18n="schedulingMorning"]').first()).toHaveText('Vormittag');
  });

  test('the page is complete when the overlay fails', async ({ page }) => {
    await page.route(OVERLAY, (route) => route.abort('failed'));
    await gotoWithLang(page, PAGE, 'de');

    // The veil is down, i18nReady resolved, and the committed wording is on screen.
    await waitForI18n(page);
    expect(await page.evaluate(() => document.body.classList.contains('i18n-loading'))).toBe(false);
    await expect(paragraph(page)).toContainText('Spielsamstagen');
  });

  test('a malformed overlay response changes nothing', async ({ page }) => {
    await stubOverlay(page, { de: 'not-an-object', en: 42 });
    await gotoWithLang(page, PAGE, 'de');

    await waitForI18n(page);
    expect(await page.evaluate(() => document.body.classList.contains('i18n-loading'))).toBe(false);
    await expect(paragraph(page)).toContainText('Spielsamstagen');
  });

  test('an overridden heading also updates the document title', async ({ page }) => {
    await stubOverlay(page, {
      de: { volleyballSpielplanungMetaTitle: 'Geänderter Titel' },
      en: {},
    });
    await gotoWithLang(page, PAGE, 'de');

    await expect.poll(() => page.title()).toBe('Geänderter Titel');
  });
});
