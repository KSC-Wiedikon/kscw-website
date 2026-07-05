// Scorer-course sign-up — dynamic client render.
// Replaces the former build-time array: fetches active courses from the
// Directus `scorer_courses` collection (public read), applies the same
// upcoming/null-last filter as getUpcomingScorerCourses, renders a card
// per course with a sign-up button (opens the OpnForm in a new tab) and
// an "add to calendar" link to a Google Calendar event template (works
// on every device; a blob: .ics did not on mobile).
// Admin edits appear on next
// page load — no rebuild. Degrades silently if Directus is unreachable.

import { getUpcomingScorerCourses, localeSlug, normalizeFormSlug, type ScorerCourse } from '../data/scorer-courses';
import { formatDate } from '../lib/utils';
import { getDirectusUrl } from '../lib/directus';

// Location, host note ("Hosted by / Powered by") and duration are per-course
// Directus fields, editable in /admin. An empty location/host note hides that
// line. Only the fallbacks below remain hardcoded: start time when a course
// has a date but no time yet, and calendar-entry length when duration is
// unset (the usual course runs 4h, e.g. 17:45–21:45).
const DEFAULT_TIME = '17:45';
const DEFAULT_HOURS = 4;

const container = document.querySelector<HTMLElement>('[data-scorer-courses]');

if (container) {
  // Runtime i18n: read the active language + translations from the live engine
  // (single-URL site — language switches client-side and fires `langChanged`),
  // not from frozen build-time data-* attributes. Re-read on every render() so
  // a language switch is reflected without a page reload.
  const i18n = (window as any).i18n;
  const getLang = (): 'de' | 'en' =>
    ((i18n && i18n.getLang && i18n.getLang()) === 'en' ? 'en' : 'de');
  const tr = (key: string): string =>
    (i18n && i18n.t ? i18n.t(key) : key);

  const section = container.closest<HTMLElement>('[data-scorer-section]');
  const base = getDirectusUrl();

  const el = (tag: string, attrs: Record<string, string> = {}, text?: string) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };

  // <i data-lucide> placeholder; lucide.createIcons() swaps it for an SVG
  // after the cards are in the DOM.
  const icon = (name: string) =>
    el('i', { 'data-lucide': name, style: 'width: 18px; height: 18px;' });

  const labelBtn = (node: HTMLElement, iconName: string, label: string) => {
    node.appendChild(icon(iconName));
    node.appendChild(el('span', {}, label));
  };

  const mapRow = (r: Record<string, unknown>): ScorerCourse => ({
    id: String(r.slug_id ?? r.id ?? ''),
    titleDe: String(r.title_de ?? ''),
    titleEn: String(r.title_en ?? ''),
    dateISO: (r.date_iso as string | null) ?? null,
    time: (r.time as string | null) ?? null,
    mode: (['in_person', 'recorded', 'both'].includes(r.mode as string)
      ? (r.mode as ScorerCourse['mode'])
      : 'in_person'),
    formSlugDe: normalizeFormSlug(r.form_slug_de as string | null),
    formSlugEn: normalizeFormSlug(r.form_slug_en as string | null),
    location: typeof r.location === 'string' ? r.location.trim() || null : null,
    hostNote: typeof r.host_note === 'string' ? r.host_note.trim() || null : null,
    durationHours: Number.isFinite(Number(r.duration_hours)) && Number(r.duration_hours) > 0
      ? Number(r.duration_hours)
      : null,
  });

  // Wall-clock Europe/Zurich → exact UTC instant, DST-safe (CET/CEST
  // offset is resolved for the given date via Intl, not hard-coded).
  const zurichToUTC = (dateISO: string, hhmm: string): Date => {
    const [y, m, d] = dateISO.split('-').map(Number);
    const [hh, mi] = hhmm.split(':').map(Number);
    const asUTC = Date.UTC(y, m - 1, d, hh, mi, 0);
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Zurich', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = Object.fromEntries(
      dtf.formatToParts(new Date(asUTC))
        .filter((x) => x.type !== 'literal')
        .map((x) => [x.type, x.value]),
    ) as Record<string, string>;
    const hour = p.hour === '24' ? '00' : p.hour;
    const zurichAsUTC = Date.UTC(
      +p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second,
    );
    return new Date(asUTC - (zurichAsUTC - asUTC));
  };

  const gcalStamp = (dt: Date): string =>
    dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // Google Calendar "add event" template URL. Works on every device —
  // desktop and mobile, app or web. A generated .ics handed out as a
  // page-scoped blob: URL cannot be resolved by the mobile Google
  // Calendar app, which is why it asked for a Google login and then said
  // "Termin nicht gefunden".
  const gcalUrl = (course: ScorerCourse, title: string, signupUrl: string): string => {
    const start = zurichToUTC(course.dateISO as string, course.time || DEFAULT_TIME);
    const end = new Date(start.getTime() + (course.durationHours ?? DEFAULT_HOURS) * 3600_000);
    const withLocation = course.mode === 'in_person' || course.mode === 'both';
    const detailsBase = withLocation && course.hostNote ? `${title}\n\n${course.hostNote}` : title;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
      details: signupUrl ? `${detailsBase}\n\n${signupUrl}` : detailsBase,
    });
    if (withLocation && course.location) params.set('location', course.location);
    return `https://www.google.com/calendar/render?${params.toString()}`;
  };

  // i18n key per course mode — resolved at render time via tr().
  const MODE_KEY: Record<ScorerCourse['mode'], string> = {
    in_person: 'scorerModeInPerson',
    recorded: 'scorerModeRecorded',
    both: 'scorerModeBoth',
  };

  const render = (courses: ScorerCourse[]) => {
    // Read the active language + translations fresh on every render so a
    // client-side language switch relabels everything. Clear first so a
    // re-render (langChanged) replaces the previous cards instead of stacking.
    const locale = getLang();
    container.textContent = '';
    for (const course of courses) {
      const slug = localeSlug(course, locale);
      const title = locale === 'en' ? course.titleEn : course.titleDe;
      const signupUrl = slug ? `https://forms.kscw.ch/forms/${slug}` : '';

      const card = el('div', { class: 'card' });
      const body = el('div', {
        class: 'card-body',
        style: 'display: flex; flex-direction: column; gap: var(--space-md);',
      });

      const headRow = el('div', {
        style: 'display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap;',
      });
      headRow.appendChild(el('h3', { style: 'margin: 0;' }, title));
      const when = course.dateISO
        ? formatDate(course.dateISO) + (course.time ? ` · ${course.time}` : '')
        : tr('scorerSignupSoon');
      headRow.appendChild(el('span', { style: 'font-weight: 600; color: var(--kscw-blue);' }, when));
      body.appendChild(headRow);

      const metaRow = el('div', {
        style: 'display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;',
      });
      metaRow.appendChild(el('span', {
        class: 'chip',
        style: 'background: var(--kscw-gold); color: var(--text-on-gold);',
      }, tr(MODE_KEY[course.mode])));
      body.appendChild(metaRow);

      if ((course.mode === 'in_person' || course.mode === 'both')) {
        if (course.location) body.appendChild(el('p', { class: 'scorer-location' }, course.location));
        if (course.hostNote) body.appendChild(el('p', { class: 'scorer-host' }, course.hostNote));
      }

      if (slug || course.dateISO) {
        const actions = el('div', { class: 'scorer-actions' });

        if (slug) {
          const cta = el('a', {
            class: 'btn btn-primary',
            href: signupUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          });
          labelBtn(cta, 'user-plus', tr('scorerSignupCta'));
          actions.appendChild(cta);
        }

        if (course.dateISO) {
          const calBtn = el('a', {
            class: 'btn btn-outline',
            href: gcalUrl(course, title, signupUrl),
            target: '_blank',
            rel: 'noopener noreferrer',
          });
          labelBtn(calBtn, 'calendar-plus', tr('scorerSignupCalendar'));
          actions.appendChild(calBtn);
        }

        body.appendChild(actions);
      }

      if (!slug && course.dateISO) {
        // Date is set but no sign-up form yet — say so without re-claiming
        // the date is TBD. When the date itself is null the header span
        // already shows the full "date to be announced" message.
        body.appendChild(el('p', {
          style: 'color: var(--text-muted); font-style: italic; margin: 0;',
        }, tr('scorerSignupOpensSoon')));
      }

      // Always-available info materials (course handout + e-learning
      // registration guide), hosted under /docs/. Secondary to the
      // sign-up CTA, so styled as outline links.
      // Doc labels read from the live engine at render time so they swap with
      // the language toggle.
      const docHandout = tr('scorerCoursesHandout');
      const docElearning = tr('scorerCoursesElearningReg');
      if (docHandout || docElearning) {
        const docs = el('div', {
          style: 'display: flex; flex-wrap: wrap; gap: var(--space-sm);',
        });
        const docLink = (href: string, label: string, iconName: string) => {
          const a = el('a', {
            class: 'btn btn-outline',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          });
          labelBtn(a, iconName, label);
          return a;
        };
        if (docHandout) {
          docs.appendChild(docLink('/docs/schreiberwesen.pdf', docHandout, 'file-text'));
        }
        if (docElearning) {
          docs.appendChild(docLink('/docs/schreiberwesen-elearning-registration.pdf', docElearning, 'clipboard-list'));
        }
        body.appendChild(docs);
      }

      card.appendChild(body);
      container.appendChild(card);
    }

    const lucide = (window as unknown as { lucide?: { createIcons: () => void } }).lucide;
    if (lucide) lucide.createIcons();
  };

  // Cache the fetched courses so a language switch re-renders from memory
  // (relabel only — no Directus refetch).
  let cachedCourses: ScorerCourse[] = [];

  // Re-render in the active language when the user switches it client-side.
  document.addEventListener('langChanged', () => {
    if (cachedCourses.length) render(cachedCourses);
  });

  const load = () =>
    fetch(`${base}/items/scorer_courses?filter[active][_eq]=true&fields=slug_id,title_de,title_en,date_iso,time,mode,form_slug_de,form_slug_en,location,host_note,duration_hours,sort&sort=sort&limit=-1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const rows = Array.isArray(json?.data) ? (json.data as Record<string, unknown>[]) : [];
        const upcoming = getUpcomingScorerCourses(rows.map(mapRow));
        if (!upcoming.length) return;
        cachedCourses = upcoming;
        render(upcoming);
        if (section) section.hidden = false;
      })
      .catch(() => { /* Directus unreachable — section stays hidden */ });

  // Wait for the i18n engine so the first render is in the active language
  // (could be English from a stored preference). Fall back if unavailable.
  const ready = (window as any).i18nReady;
  if (ready && typeof ready.then === 'function') {
    ready.then(load, load);
  } else {
    load();
  }
}
