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

// Scorer courses take place at Sportanlage Irchel, hosted by VBC Spada.
// The collection has no location/end-time fields, so these are fixed:
// in-person courses use the venue address, and a course runs DEFAULT_HOURS
// from its start time (the published courses are 19:00–21:30 = 2.5h).
// Defaults only — if the Directus schema later gains real fields, prefer those.
const KSCW_LOCATION = 'Sportanlage Irchel (Theory Room), Winterthurerstrasse 190, 8057 Zürich';
const HOST_NOTE = 'Hosted by VBC Spada, Powered by KSC Wiedikon';
const DEFAULT_TIME = '19:00';
const DEFAULT_HOURS = 2.5;

const container = document.querySelector<HTMLElement>('[data-scorer-courses]');

if (container) {
  const locale = (container.dataset.locale === 'en' ? 'en' : 'de') as 'de' | 'en';
  const txt = {
    soon: container.dataset.soon || '',
    opensSoon: container.dataset.opensSoon || '',
    cta: container.dataset.cta || '',
    cal: container.dataset.cal || '',
    docHandout: container.dataset.docHandout || '',
    docElearning: container.dataset.docElearning || '',
    mode: {
      in_person: container.dataset.modeInPerson || '',
      recorded: container.dataset.modeRecorded || '',
      both: container.dataset.modeBoth || '',
    } as Record<ScorerCourse['mode'], string>,
  };
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
    const end = new Date(start.getTime() + DEFAULT_HOURS * 3600_000);
    const withLocation = course.mode === 'in_person' || course.mode === 'both';
    const detailsBase = withLocation ? `${title}\n\n${HOST_NOTE}` : title;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
      details: signupUrl ? `${detailsBase}\n\n${signupUrl}` : detailsBase,
    });
    if (withLocation) params.set('location', KSCW_LOCATION);
    return `https://www.google.com/calendar/render?${params.toString()}`;
  };

  const render = (courses: ScorerCourse[]) => {
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
        : txt.soon;
      headRow.appendChild(el('span', { style: 'font-weight: 600; color: var(--kscw-blue);' }, when));
      body.appendChild(headRow);

      const metaRow = el('div', {
        style: 'display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;',
      });
      metaRow.appendChild(el('span', {
        class: 'chip',
        style: 'background: var(--kscw-gold); color: var(--text-on-gold);',
      }, txt.mode[course.mode] || ''));
      body.appendChild(metaRow);

      if ((course.mode === 'in_person' || course.mode === 'both')) {
        body.appendChild(el('p', { class: 'scorer-location' }, KSCW_LOCATION));
        body.appendChild(el('p', { class: 'scorer-host' }, HOST_NOTE));
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
          labelBtn(cta, 'user-plus', txt.cta);
          actions.appendChild(cta);
        }

        if (course.dateISO) {
          const calBtn = el('a', {
            class: 'btn btn-outline',
            href: gcalUrl(course, title, signupUrl),
            target: '_blank',
            rel: 'noopener noreferrer',
          });
          labelBtn(calBtn, 'calendar-plus', txt.cal);
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
        }, txt.opensSoon));
      }

      // Always-available info materials (course handout + e-learning
      // registration guide), hosted under /docs/. Secondary to the
      // sign-up CTA, so styled as outline links.
      if (txt.docHandout || txt.docElearning) {
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
        if (txt.docHandout) {
          docs.appendChild(docLink('/docs/schreiberwesen.pdf', txt.docHandout, 'file-text'));
        }
        if (txt.docElearning) {
          docs.appendChild(docLink('/docs/schreiberwesen-elearning-registration.pdf', txt.docElearning, 'clipboard-list'));
        }
        body.appendChild(docs);
      }

      card.appendChild(body);
      container.appendChild(card);
    }

    const lucide = (window as unknown as { lucide?: { createIcons: () => void } }).lucide;
    if (lucide) lucide.createIcons();
  };

  fetch(`${base}/items/scorer_courses?filter[active][_eq]=true&fields=slug_id,title_de,title_en,date_iso,time,mode,form_slug_de,form_slug_en,sort&sort=sort&limit=-1`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      const rows = Array.isArray(json?.data) ? (json.data as Record<string, unknown>[]) : [];
      const upcoming = getUpcomingScorerCourses(rows.map(mapRow));
      if (!upcoming.length) return;
      render(upcoming);
      if (section) section.hidden = false;
    })
    .catch(() => { /* Directus unreachable — section stays hidden */ });
}
