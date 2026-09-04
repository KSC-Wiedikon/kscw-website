import { test, expect, type Page } from '@playwright/test';

/**
 * Scorer registrations: the address column, the licence cross-check, and signups added
 * by hand.
 *
 * Backend fully stubbed the same way tests/e2e/admin-mobile.spec.ts does it — a session
 * token straight into sessionStorage, every Directus call fulfilled from fixtures — so
 * this runs in CI with no credentials against the real render path.
 *
 * What it pins:
 *  - The address is a COLUMN. It used to live only inside the expanded row, so the one
 *    answer the SVRZ Teilnehmerliste cannot do without was invisible while scanning the
 *    list, and a guessed "Zürich" was indistinguishable from a stated one.
 *  - A hand-added signup is a scorer_course_attendance row, never an OpnForm submission:
 *    writing to the form re-fires its notification emails, and a form past its deadline
 *    rejects the write — which is the late-signup case this exists for.
 *  - Its delete goes to Directus. Routed to OpnForm it would 404 on a submission id
 *    OpnForm has never heard of, and the row would stay on screen.
 *  - The SV licence column shows the tracked value once one is entered, hiding what the
 *    participant wrote. When the two disagree the admin is told, and offered the form's
 *    answer back.
 */

const DIRECTUS = 'https://directus-dev.kscw.ch';
const SLUG = 'scorerkurs-wiedikon-de';

const FIELD = {
  first: 'f_first', last: 'f_last', mail: 'f_mail', svrz: 'f_svrz',
  strasse: 'f_strasse', plz: 'f_plz', ort: 'f_ort', team: 'f_team',
};
const FORM_FIELDS = [
  { id: FIELD.first, name: 'Vorname', type: 'text' },
  { id: FIELD.last, name: 'Nachname', type: 'text' },
  { id: FIELD.mail, name: 'E-Mail', type: 'email' },
  { id: FIELD.strasse, name: 'Strasse und Nummer', type: 'text' },
  { id: FIELD.plz, name: 'PLZ', type: 'number' },
  { id: FIELD.ort, name: 'Ort', type: 'text' },
  { id: FIELD.svrz, name: 'SVRZ Lizenznummer', type: 'text' },
  { id: FIELD.team, name: 'Team', type: 'multi_select', options: ['D1', 'H1'] },
];

const COURSE = {
  id: 1, slug_id: 'sk-2026-01', title_de: 'Scorerkurs Wiedikon', title_en: 'Scorer Course Wiedikon',
  date_iso: '2026-01-24', time: '10:00:00', mode: 'in_person', active: true,
  form_slug_de: SLUG, form_slug_en: '',
};

// s1 stated a full address; s2 gave none, which is what puts the guessed town on the list.
const SUBMISSIONS = [
  { id: 's1', created_at: '2026-01-02T09:00:00Z', [FIELD.first]: 'Alessandra',
    [FIELD.last]: 'Bernasconi', [FIELD.mail]: 'a@example.ch', [FIELD.svrz]: '123456',
    [FIELD.strasse]: 'Musterweg 1', [FIELD.plz]: '8003', [FIELD.ort]: 'Wädenswil' },
  { id: 's2', created_at: '2026-01-03T09:00:00Z', [FIELD.first]: 'Jonas',
    [FIELD.last]: 'Müller', [FIELD.mail]: 'jonas@example.ch', [FIELD.svrz]: '' },
];

type Write = { method: string; url: string; body: Record<string, unknown> | null };

type CreateReply = { status: number; body: Record<string, unknown> } | null;

async function stub(page: Page, opts: {
  attendance?: Record<string, unknown>[];
  onCreate?: (body: Record<string, unknown> | null, nth: number) => CreateReply;
} = {}) {
  const attendance = opts.attendance ? opts.attendance.slice() : [];
  const writes: Write[] = [];
  let nextId = 90;

  await page.route(`${DIRECTUS}/**`, (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/wadmin/me')) return json({ isSuperuser: true, sections: ['scorer_courses'] });
    if (url.includes('items/scorer_courses')) return json({ data: [COURSE] });

    if (url.includes('items/scorer_course_attendance')) {
      let body: Record<string, unknown> | null = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
      if (method === 'POST') {
        writes.push({ method, url, body });
        const row = { id: nextId++, ...(body || {}) };
        attendance.push(row); // so the refresh after saving shows the new row
        return json({ data: { id: row.id } });
      }
      if (method === 'DELETE' || method === 'PATCH') {
        writes.push({ method, url, body });
        if (method === 'DELETE') {
          const id = Number(url.split('/').pop());
          const i = attendance.findIndex((r) => Number(r.id) === id);
          if (i > -1) attendance.splice(i, 1);
        }
        return json({ ok: true });
      }
      return json({ data: attendance });
    }

    if (url.includes('/member-addresses')) return json({ data: {} });
    if (url.includes('/member-licences')) return json({ data: {} });
    if (url.includes('/submissions')) {
      if (method === 'POST') { // filing a signup into the form itself
        let body: Record<string, unknown> | null = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
        writes.push({ method, url, body });
        const reply = opts.onCreate ? opts.onCreate(body, writes.length) : null;
        if (reply) return route.fulfill({ status: reply.status, contentType: 'application/json',
                                          body: JSON.stringify(reply.body) });
        return json({ ok: true, submission_id: 'new-1', reopened: false });
      }
      return json({ fields: FORM_FIELDS, data: SUBMISSIONS });
    }
    return json({ data: [] });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('kscw_admin_auth', JSON.stringify({
      access_token: 'stub', refresh_token: 'stub', expires_at: Date.now() + 3_600_000,
    }));
    localStorage.setItem('kscw_admin_lang', 'de');
  });

  return { writes };
}

async function openRegistrations(page: Page) {
  await page.goto('/admin/?tab=scorer_courses&course=1');
  await page.waitForSelector('.admin-reg-table');
  await expect(page.locator('.admin-loading')).toHaveCount(0);
}

function row(page: Page, surname: string) {
  return page.locator('tr.reg-row').filter({ has: page.locator('td.reg-c-last', { hasText: surname }) });
}

test.describe('scorer registrations', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the address is a column, and a guessed town says so', async ({ page }) => {
    await stub(page);
    await openRegistrations(page);

    const stated = row(page, 'Bernasconi').locator('td.reg-c-addr');
    await expect(stated).toContainText('Musterweg 1');
    await expect(stated).toContainText('8003 Wädenswil');
    await expect(stated).toHaveAttribute('title', '');

    // Nothing stated, nothing in the member register: the export would print Zürich, and
    // the column has to admit that is an assumption rather than an address.
    const guessed = row(page, 'Müller').locator('td.reg-c-addr');
    await expect(guessed).toContainText('Zürich ?');
    await expect(guessed).toHaveAttribute('title', /Angenommen/);
  });

  test('a licence that differs from the signup is flagged, a matching one is not',
    async ({ page }) => {
      await stub(page, { attendance: [
        // Someone typed a different number into the column; the form said 123456.
        { id: 11, sub_key: `${SLUG}:s1`, form_slug: SLUG, submission_id: 's1', sv_license: '999999' },
        { id: 12, sub_key: `${SLUG}:s2`, form_slug: SLUG, submission_id: 's2', sv_license: '' },
      ] });
      await openRegistrations(page);

      const fix = row(page, 'Bernasconi').getByRole('button', { name: /Formular: 123456/ });
      await expect(fix).toBeVisible();
      await expect(row(page, 'Müller').getByRole('button', { name: /Formular:/ })).toHaveCount(0);

      // One click puts the participant's own answer back in the box.
      await fix.click();
      await expect(row(page, 'Bernasconi').locator('td.reg-c-sv input')).toHaveValue('123456');
      await expect(fix).toBeHidden();
    });

  test('spacing is not a disagreement', async ({ page }) => {
    await stub(page, { attendance: [
      { id: 11, sub_key: `${SLUG}:s1`, form_slug: SLUG, submission_id: 's1', sv_license: '123 456' },
    ] });
    await openRegistrations(page);
    await expect(row(page, 'Bernasconi').getByRole('button', { name: /Formular:/ })).toHaveCount(0);
  });

  test('a signup added by hand lands in Directus, not in the form', async ({ page }) => {
    const { writes } = await stub(page);
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    const modal = page.locator('.admin-modal-body');
    await expect(modal).toBeVisible();

    async function fill(label: string, value: string) {
      await modal.locator('label').filter({ hasText: `${label}:` }).locator('input').fill(value);
    }
    await fill('Vorname', 'Nachträglich');
    await fill('Nachname', 'Zumbrunn');
    await fill('Ort', 'Stallikon');
    await fill('PLZ', '8143');
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    // The row is created as attendance, with its answers in the corrections document —
    // and nothing at all is sent to OpnForm.
    await expect.poll(() => writes.length).toBe(1);
    const body = writes[0].body as Record<string, string>;
    expect(writes[0].url).toContain('items/scorer_course_attendance');
    expect(body.form_slug).toBe(SLUG);
    expect(body.submission_id).toMatch(/^manual-/);
    expect(body.sub_key).toBe(`${SLUG}:${body.submission_id}`);
    expect(JSON.parse(body.field_overrides)).toMatchObject({
      [FIELD.first]: 'Nachträglich', [FIELD.last]: 'Zumbrunn',
      [FIELD.plz]: '8143', [FIELD.ort]: 'Stallikon',
    });

    // …and it comes back as an ordinary row, address column included.
    const added = row(page, 'Zumbrunn');
    await expect(added).toBeVisible();
    await expect(added.locator('td.reg-c-last')).toContainText('nachgetragen');
    await expect(added.locator('td.reg-c-addr')).toContainText('8143 Stallikon');
  });

  test('ticking the box files it in the form itself, and sends the Team as a list',
    async ({ page }) => {
      const { writes } = await stub(page);
      await openRegistrations(page);

      await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
      const modal = page.locator('.admin-modal-body');
      await modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input').fill('Spät');
      await modal.locator('label').filter({ hasText: 'Nachname:' }).locator('input').fill('Gemeldet');
      await modal.locator('label').filter({ hasText: 'Team:' }).locator('select').selectOption(['D1', 'H1']);
      await page.getByText('Auch im Anmeldeformular erfassen').click();
      await page.locator('.admin-modal-footer .admin-btn-primary').click();

      await expect.poll(() => writes.length).toBe(1);
      // The form's own answer endpoint — not the attendance table.
      expect(writes[0].url).toContain(`opnform/forms/${SLUG}/submissions`);
      expect(writes[0].url).not.toContain('items/scorer_course_attendance');
      const body = writes[0].body as Record<string, unknown>;
      expect(body.reopen_if_closed).toBe(false); // never on the first attempt
      expect(body.data).toEqual({
        [FIELD.first]: 'Spät', [FIELD.last]: 'Gemeldet', [FIELD.team]: ['D1', 'H1'],
      });
    });

  // The ordinary state of a form you are adding a latecomer to. The short reopen is
  // asked for out loud and never assumed.
  test('a closed form is opened only after the admin says so', async ({ page }) => {
    const { writes } = await stub(page, {
      onCreate: (_body, nth) => (nth === 1
        ? { status: 409, body: { error: 'form_closed', closes_at: '2026-08-11T22:00:00+00:00' } }
        : null),
    });
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    const modal = page.locator('.admin-modal-body');
    await modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input').fill('Spät');
    await modal.locator('label').filter({ hasText: 'Nachname:' }).locator('input').fill('Gemeldet');
    await page.getByText('Auch im Anmeldeformular erfassen').click();
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    // Swiss date, and the question names the consequence.
    const confirm = page.locator('.admin-confirm-content');
    await expect(confirm).toContainText('11.08.2026');
    await expect(confirm).toContainText('geschlossen');
    await confirm.locator('.admin-btn-primary').click();

    await expect.poll(() => writes.length).toBe(2);
    expect((writes[0].body as Record<string, unknown>).reopen_if_closed).toBe(false);
    expect((writes[1].body as Record<string, unknown>).reopen_if_closed).toBe(true);
  });

  test('declining the reopen files nothing', async ({ page }) => {
    const { writes } = await stub(page, {
      onCreate: () => ({ status: 409, body: { error: 'form_closed', closes_at: '2026-08-11T22:00:00+00:00' } }),
    });
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    const modal = page.locator('.admin-modal-body');
    await modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input').fill('Spät');
    await modal.locator('label').filter({ hasText: 'Nachname:' }).locator('input').fill('Gemeldet');
    await page.getByText('Auch im Anmeldeformular erfassen').click();
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    await page.locator('.admin-confirm-content .admin-btn').first().click(); // Abbrechen
    await expect(page.locator('.admin-confirm-content')).toHaveCount(0);
    await expect(page.locator('.admin-modal-body')).toBeVisible(); // still open, nothing lost
    expect(writes).toHaveLength(1);
  });

  // "The form said no" sends an admin hunting through twelve required questions.
  test('a refused answer is named', async ({ page }) => {
    await stub(page, {
      onCreate: () => ({ status: 422, body: { error: 'validation', fields: [
        { id: FIELD.mail, name: 'E-Mail', messages: ['required'] },
        { id: FIELD.plz, name: 'PLZ', messages: ['required'] },
      ] } }),
    });
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    const modal = page.locator('.admin-modal-body');
    await modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input').fill('Spät');
    await modal.locator('label').filter({ hasText: 'Nachname:' }).locator('input').fill('Gemeldet');
    await page.getByText('Auch im Anmeldeformular erfassen').click();
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    await expect(modal).toContainText('E-Mail');
    await expect(modal).toContainText('PLZ');
    await expect(modal).toBeVisible(); // the typed answers survive the rejection
    await expect(modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input')).toHaveValue('Spät');
  });

  // The signup is filed; what failed is putting the deadline back.
  test('a form left open is reported as such', async ({ page }) => {
    await stub(page, {
      onCreate: () => ({ status: 500, body: { error: 'form_left_open', closes_at: '2026-08-11T22:00:00+00:00' } }),
    });
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    const modal = page.locator('.admin-modal-body');
    await modal.locator('label').filter({ hasText: 'Vorname:' }).locator('input').fill('Spät');
    await modal.locator('label').filter({ hasText: 'Nachname:' }).locator('input').fill('Gemeldet');
    await page.getByText('Auch im Anmeldeformular erfassen').click();
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    await expect(modal).toContainText('nimmt gerade Anmeldungen an');
  });

  test('a hand-added signup needs a name', async ({ page }) => {
    const { writes } = await stub(page);
    await openRegistrations(page);

    await page.getByRole('button', { name: /Anmeldung nachtragen/ }).click();
    await page.locator('.admin-modal-body label').filter({ hasText: 'Ort:' }).locator('input').fill('Zürich');
    await page.locator('.admin-modal-footer .admin-btn-primary').click();

    await expect(page.locator('.admin-modal-body')).toContainText('Vor- oder Nachname');
    expect(writes).toHaveLength(0);
  });

  test('deleting a hand-added signup deletes the Directus row', async ({ page }) => {
    const { writes } = await stub(page, { attendance: [
      { id: 77, sub_key: `${SLUG}:manual-abc`, form_slug: SLUG, submission_id: 'manual-abc',
        field_overrides: JSON.stringify({ [FIELD.first]: 'Spät', [FIELD.last]: 'Anmeldung' }) },
    ] });
    await openRegistrations(page);

    const added = row(page, 'Anmeldung');
    await expect(added).toBeVisible();
    await added.getByRole('button', { name: 'Löschen' }).click();
    await page.locator('.admin-confirm-content .admin-btn-danger').click();

    await expect.poll(() => writes.filter((w) => w.method === 'DELETE').length).toBe(1);
    expect(writes.find((w) => w.method === 'DELETE')!.url).toContain('items/scorer_course_attendance/77');
    await expect(row(page, 'Anmeldung')).toHaveCount(0);
  });
});
