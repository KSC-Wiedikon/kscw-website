import { test, expect, type Page } from '@playwright/test';

/**
 * /admin on a phone.
 *
 * The dashboard is behind a Directus login, so tests/e2e/admin.spec.ts skips
 * itself unless PB_TEST_EMAIL/PB_TEST_PASSWORD are set — which means the admin
 * layout has never been covered in CI. Here the whole backend is stubbed
 * instead: a session token goes straight into sessionStorage (the admin reads
 * `kscw_admin_auth` from there) and every Directus call is fulfilled from
 * fixtures. No credentials, no network, and the real render path.
 *
 * Note the origin: admin.astro points at directus-dev.kscw.ch whenever the page
 * is served from localhost, and `astro preview` is localhost — so that is the
 * host to intercept.
 *
 * What this pins is the 2026-08-20 mobile pass:
 *  - No table may spill past the viewport. Three of them did, and because
 *    global.css clips horizontal overflow the spilled columns were not merely
 *    off-screen, they were unreachable.
 *  - The registrations table stops being a table below 820px. Nine columns need
 *    ~940px; in a 390px scroll box you got surname, first name and a sliver of
 *    the third — every control an admin actually uses at a course (present /
 *    exam / SV licence) sat off the right edge.
 *  - Form fields stay at 16px. Under that, iOS Safari zooms the page on focus
 *    and does not zoom back out.
 */

const DIRECTUS = 'https://directus-dev.kscw.ch';
const PHONE = { width: 390, height: 844 };

const SECTIONS = ['news', 'events', 'registrations', 'sponsors',
                  'scorer_courses', 'mixed_turnier', 'site_text'];

const FIELD = { first: 'f_first', last: 'f_last', mail: 'f_mail', svrz: 'f_svrz' };
const FORM_FIELDS = [
  { id: FIELD.first, name: 'Vorname', type: 'text' },
  { id: FIELD.last, name: 'Nachname', type: 'text' },
  { id: FIELD.mail, name: 'E-Mail', type: 'email' },
  { id: FIELD.svrz, name: 'SVRZ Lizenznummer', type: 'text' },
];

const COURSE = {
  id: 1, slug_id: 'sk-2026-01', title_de: 'Scorerkurs Wiedikon', title_en: 'Scorer Course Wiedikon',
  date_iso: '2026-01-24', time: '10:00:00', mode: 'in_person', active: true,
  form_slug_de: 'scorerkurs-wiedikon-de', form_slug_en: '',
};

async function stubAdmin(page: Page) {
  await page.route(`${DIRECTUS}/**`, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/wadmin/me')) return json({ isSuperuser: true, sections: SECTIONS });
    if (url.includes('/wadmin/admins')) {
      return json({ data: [
        { id: 'u1', email: 'anne.beispiel@kscw.ch', first_name: 'Anne', last_name: 'Beispiel', sections: ['news'] },
        { id: 'u2', email: 'lukas.mustermann@kscw.ch', first_name: 'Lukas', last_name: 'Mustermann', sections: ['scorer_courses'] },
      ] });
    }
    if (url.includes('items/scorer_courses')) return json({ data: [COURSE] });
    if (url.includes('items/scorer_course_attendance')) return json({ data: [] });
    if (url.includes('/member-addresses')) return json({ data: {} });
    if (url.includes('/submissions')) {
      return json({ fields: FORM_FIELDS, data: [
        { id: 's1', created_at: '2026-01-02T09:00:00Z', [FIELD.first]: 'Alessandra',
          [FIELD.last]: 'Bernasconi-Rüegg', [FIELD.mail]: 'a@example.ch', [FIELD.svrz]: '123456' },
        { id: 's2', created_at: '2026-01-03T09:00:00Z', [FIELD.first]: 'Jonas',
          [FIELD.last]: 'Müller', [FIELD.mail]: 'jonas@example.ch', [FIELD.svrz]: '' },
      ] });
    }
    if (url.includes('items/mixed_tournament_signups')) {
      return json({ data: [
        { id: 1, first_name: 'Nina', last_name: 'Steinbrüchel', email: 'nina@example.ch',
          sex: 'f', date_created: '2026-08-01T10:00:00Z' },
      ] });
    }
    if (url.includes('items/news')) {
      return json({ data: [
        { id: 1, title: 'Heimspielwochenende in der Sporthalle Kern', title_en: 'Home game weekend',
          slug: 'n1', published_at: '2026-08-01T10:00:00Z', status: 'published', body: '<p>x</p>' },
      ] });
    }
    if (url.includes('items/events')) {
      return json({ data: [
        { id: 1, title: 'Mixed-Turnier Wiedikon', title_en: 'Mixed tournament',
          event_date: '2026-09-20', start_time: '18:00:00', location: 'Sporthalle Kern, Zürich' },
      ] });
    }
    if (url.includes('items/sponsors')) {
      return json({ data: [
        { id: 1, name: 'Sponsor Aktiengesellschaft', website_url: 'https://example.ch',
          sort_order: 0, active: true, logo: null },
      ] });
    }
    if (url.includes('items/registrations')) {
      return json({ data: [
        { id: 1, first_name: 'Vorname', last_name: 'Nachname', email: 'p@example.ch',
          status: 'pending', submitted_at: '2026-08-10T10:00:00Z', sport: 'volleyball' },
      ] });
    }
    if (url.includes('/kscw/public/teams')) {
      // Enough live teams for the drift table to render rows; the defs it is
      // compared against come from the build-time island in the page.
      return json({ data: [
        { id: 101, name: 'Damen 1', sport: 'volleyball', team_id: null },
        { id: 102, name: 'Herren 1', sport: 'volleyball', team_id: null },
        { id: 103, name: 'Basketball Herren 1', sport: 'basketball', team_id: 'bb_h1' },
      ] });
    }
    if (url.includes('/wadmin/site_text/text')) return json({ data: {} });
    return json({ data: [] });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('kscw_admin_auth', JSON.stringify({
      access_token: 'stub', refresh_token: 'stub', expires_at: Date.now() + 3_600_000,
    }));
    localStorage.setItem('kscw_admin_lang', 'de');
  });
}

/** Wait for the dashboard shell plus whatever the active tab renders into it. */
async function openTab(page: Page, query: string) {
  await page.goto(`/admin/${query}`);
  await page.waitForSelector('.admin-tabs');
  await expect(page.locator('.admin-loading')).toHaveCount(0);
}

test.describe('/admin on a phone', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => { await stubAdmin(page); });

  const TABS = [
    ['scorer_courses', '?tab=scorer_courses'],
    ['scorer registrations', '?tab=scorer_courses&course=1'],
    ['news', '?tab=news'],
    ['events', '?tab=events'],
    ['registrations', '?tab=registrations'],
    ['sponsors', '?tab=sponsors'],
    ['mixed_turnier', '?tab=mixed_turnier'],
    ['site_text', '?tab=site_text'],
    ['admin grants', '?tab=admin'],
    ['teams', '?tab=teams'],
  ] as const;

  for (const [name, query] of TABS) {
    test(`${name} keeps its content inside the viewport`, async ({ page }) => {
      await openTab(page, query);
      const { contentWidth, viewportWidth } = await page.evaluate(() => ({
        contentWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      // Both halves of this comparison were arrived at the hard way:
      //
      //  - body.scrollWidth, not documentElement.scrollWidth. global.css clips
      //    horizontal overflow on html AND body, which clamps the documentElement
      //    figure to the viewport — it reported a tidy 390 while the Mixed-Turnier
      //    table was 754 wide with 364px of it unreachable. body.scrollWidth still
      //    reports the real content width through the clip.
      //  - clientWidth, not window.innerWidth. Under Playwright's mobile emulation
      //    (`isMobile`, which the "mobile" project turns on) the layout viewport
      //    grows to fit overflowing content — innerWidth read 1560 on a 390px
      //    screen — so any `<= innerWidth` assertion passes no matter what.
      expect(contentWidth, `${name} spills past the viewport`).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }

  // Data-independent companion to the sweep above: with short fixture values a
  // table can happen to fit, and then the sweep proves nothing about it. This
  // asserts the structure instead — every table sits in a scroll box.
  for (const [name, query] of [['mixed_turnier', '?tab=mixed_turnier'],
                               ['admin grants', '?tab=admin'],
                               ['teams', '?tab=teams']] as const) {
    test(`the ${name} table sits in a scroll box`, async ({ page }) => {
      await openTab(page, query);
      const tables = page.locator('.admin-table, .admin-grant-grid');
      expect(await tables.count(), `${name} rendered no table to check`).toBeGreaterThan(0);
      const unwrapped = await page.evaluate(() =>
        [...document.querySelectorAll('.admin-table, .admin-grant-grid')]
          .filter((t) => !t.closest('.admin-scroll-x'))
          .map((t) => t.className));
      expect(unwrapped, 'a table outside .admin-scroll-x gets its right-hand columns clipped away').toEqual([]);
    });
  }

  test('the registrations table becomes cards, with every control on screen', async ({ page }) => {
    await openTab(page, '?tab=scorer_courses&course=1');

    const cards = page.locator('.admin-reg-table tr.reg-row');
    await expect(cards).toHaveCount(2);

    // Sorted by surname, and the surname is the card's heading.
    await expect(cards.first().locator('td.reg-c-last')).toHaveText('Bernasconi-Rüegg');

    // The three controls that were off the right edge before.
    const card = cards.first();
    for (const sel of ['td.reg-c-cell input[type="checkbox"]', 'td.reg-c-sv input', 'td.reg-c-act button']) {
      const box = await card.locator(sel).first().boundingBox();
      expect(box, `${sel} has no box`).not.toBeNull();
      expect(box!.x + box!.width, `${sel} sits off screen`).toBeLessThanOrEqual(PHONE.width);
    }

    // The header row is gone, so each cell names itself from data-label.
    await expect(card.locator('td.reg-c-sv')).toHaveAttribute('data-label', /Lizenz/i);
  });

  test('the detail panel still expands', async ({ page }) => {
    await openTab(page, '?tab=scorer_courses&course=1');
    const detail = page.locator('.admin-reg-table tr.reg-detail-row').first();
    await expect(detail).toBeHidden();
    await page.locator('.admin-reg-table td.reg-c-arrow').first().click();
    await expect(detail).toBeVisible();
    // Every form answer in the panel is an editable field (the "staff can correct
    // a signup's answers" feature), so the value lives in the input, not in text.
    await expect(detail.locator('input[type="email"]').first()).toHaveValue('a@example.ch');

    // Those editors carry an inline font-size, which beats the 16px rule unless
    // it is !important — so check them where they actually render.
    const zoomers = await detail.evaluate((tr) =>
      [...tr.querySelectorAll<HTMLElement>('input, select, textarea')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => (el as HTMLInputElement).type || el.tagName));
    expect(zoomers, 'detail-panel fields under 16px make iOS Safari zoom in').toEqual([]);
  });

  test('email mode reveals the select column', async ({ page }) => {
    await openTab(page, '?tab=scorer_courses&course=1');
    const select = page.locator('.admin-reg-table td.reg-c-sel').first();
    await expect(select).toBeHidden();
    await page.getByRole('button', { name: /E-Mail senden/ }).click();
    await expect(select).toBeVisible();
  });

  test('no form field is small enough to make iOS zoom', async ({ page }) => {
    await openTab(page, '?tab=news');
    await page.locator('#fab-btn').click();
    await page.waitForSelector('.admin-modal-content');
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')]
        .filter((el) => el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'hidden')
        .filter((el) => el.offsetParent !== null)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => el.name || el.className || el.type));
    expect(tooSmall, 'fields under 16px make iOS Safari zoom in and stay zoomed').toEqual([]);
  });

  test('the + button stays off the tabs that cannot create anything', async ({ page }) => {
    await openTab(page, '?tab=admin');
    await expect(page.locator('#fab-btn')).toBeHidden();
    await openTab(page, '?tab=news');
    await expect(page.locator('#fab-btn')).toBeVisible();
  });
});
