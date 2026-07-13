import { test, expect } from '@playwright/test';
import { gotoWithLang } from './helpers';

test.describe('islands - theme toggle', () => {
  test('clicking theme toggle switches class', async ({ page }) => {
    await gotoWithLang(page, '/');
    const html = page.locator('html');
    const toggle = page.locator('.theme-toggle').first();
    await expect(toggle).toBeVisible();

    const hadLight = await html.evaluate((el) => el.classList.contains('light'));

    await toggle.click();

    if (hadLight) {
      await expect(html).not.toHaveClass(/light/);
    } else {
      await expect(html).toHaveClass(/light/);
    }
  });

  test('theme persists after reload', async ({ page }) => {
    await gotoWithLang(page, '/');
    const toggle = page.locator('.theme-toggle').first();
    await toggle.click();

    const classAfterClick = await page.locator('html').evaluate((el) =>
      el.classList.contains('light')
    );

    await page.reload();

    const classAfterReload = await page.locator('html').evaluate((el) =>
      el.classList.contains('light')
    );

    expect(classAfterReload).toBe(classAfterClick);
  });
});

test.describe('islands - mobile nav', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger toggles nav-open class', async ({ page }) => {
    await gotoWithLang(page, '/');
    const hamburger = page.locator('.nav-hamburger');
    await hamburger.click();
    await expect(page.locator('body')).toHaveClass(/nav-open/);
    await hamburger.click();
    await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  });
});

test.describe('islands - scroll animations', () => {
  test('fade-in elements get visible class when scrolled into view', async ({ page }) => {
    await gotoWithLang(page, '/');

    const fadeElements = page.locator('.fade-in');
    const count = await fadeElements.count();
    if (count === 0) return;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await page.waitForTimeout(500);

    const visibleCount = await page.locator('.fade-in.visible').count();
    expect(visibleCount).toBeGreaterThan(0);
  });
});

test.describe('islands - accordion', () => {
  test('accordion items toggle open class', async ({ page }) => {
    await gotoWithLang(page, '/volleyball/reglemente');
    const header = page.locator('.accordion-header').first();

    if ((await header.count()) === 0) return;

    const item = page.locator('.accordion-item').first();
    await header.click();
    await expect(item).toHaveClass(/open/);
    await header.click();
    await expect(item).not.toHaveClass(/open/);
  });
});

test.describe('islands - event cards', () => {
  test('event cards expand on click', async ({ page }) => {
    await gotoWithLang(page, '/weiteres/kalender');
    const card = page.locator('.event-card--clickable').first();

    if ((await card.count()) === 0) return;

    await card.click();
    await expect(card).toHaveClass(/event-card--open/);
    await card.click();
    await expect(card).not.toHaveClass(/event-card--open/);
  });
});

test.describe('islands - stat counters', () => {
  test('stat counters show non-zero values after scroll', async ({ page }) => {
    await gotoWithLang(page, '/club/ueber-uns');
    const statEl = page.locator('.stat-number[data-value]').first();

    if ((await statEl.count()) === 0) return;

    await statEl.scrollIntoViewIfNeeded();

    await page.waitForTimeout(2000);

    const text = await statEl.textContent();
    expect(text).toBeTruthy();
    const num = parseInt(text!.replace(/\D/g, ''), 10);
    expect(num).toBeGreaterThan(0);
  });
});

test.describe('islands - sponsor carousel', () => {
  test('sponsor carousel clones children for infinite scroll', async ({ page }) => {
    await gotoWithLang(page, '/');
    const track = page.locator('.sponsor-track');

    if ((await track.count()) === 0) return;

    // Sponsors are fetched from the API — may not be reachable in CI
    const hasChildren = await track.locator('a').first().isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasChildren) {
      test.skip(true, 'Sponsor API not reachable — no sponsors loaded');
      return;
    }

    // Once sponsors are present, clones should appear for infinite scroll
    await expect(track.locator('[aria-hidden="true"]').first()).toBeAttached({ timeout: 5000 });
    const hasAriaHidden = await track.locator('[aria-hidden="true"]').count();
    expect(hasAriaHidden).toBeGreaterThan(0);
  });
});

test.describe('islands - calendar grid', () => {
  test('calendar renders with day headers', async ({ page }) => {
    await gotoWithLang(page, '/weiteres/kalender');
    const grid = page.locator('#calendar-grid');

    if ((await grid.count()) === 0) return;

    await page.waitForSelector('.cal-dow', { timeout: 10_000 });

    await expect(page.locator('.cal-dow-cell').first()).toBeVisible();
  });

  test('calendar prev/next month navigation works', async ({ page }) => {
    await gotoWithLang(page, '/weiteres/kalender');
    const grid = page.locator('#calendar-grid');
    if ((await grid.count()) === 0) return;

    await page.waitForSelector('.cal-month-label', { timeout: 10_000 });

    const initialMonth = await page.locator('.cal-month-label').textContent();

    await page.locator('.cal-nav-btn').last().click();
    await page.waitForTimeout(500);

    const nextMonth = await page.locator('.cal-month-label').textContent();
    expect(nextMonth).not.toBe(initialMonth);

    await page.locator('.cal-nav-btn').first().click();
    await page.waitForTimeout(500);

    const backMonth = await page.locator('.cal-month-label').textContent();
    expect(backMonth).toBe(initialMonth);
  });

  test('calendar Today button returns to current month', async ({ page }) => {
    await gotoWithLang(page, '/weiteres/kalender');
    const grid = page.locator('#calendar-grid');
    if ((await grid.count()) === 0) return;

    await page.waitForSelector('.cal-today-btn', { timeout: 10_000 });

    await page.locator('.cal-nav-btn').last().click();
    await page.waitForTimeout(500);
    await page.locator('.cal-nav-btn').last().click();
    await page.waitForTimeout(500);

    await page.locator('.cal-today-btn').click();
    await page.waitForTimeout(500);

    const monthLabel = await page.locator('.cal-month-label').textContent();
    const now = new Date();
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const expected = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    expect(monthLabel).toBe(expected);
  });
});
