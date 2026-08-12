/**
 * KSCW youth teams — eligible Jahrgänge, recomputed in the browser.
 *
 * The "Jahrgänge: 2009, 2010" line is baked into the static HTML so it is there on
 * first paint and without JS. But the categories all shift by one on 1 August, and
 * nothing rebuilds this site on a date alone — the Directus auto-rebuild Flow only
 * fires on content edits — so a build from July would keep last season's years all
 * through August, until some unrelated edit happened to trigger a deploy. Same
 * reason youth-status.js prunes expired training lines.
 *
 * So every `[data-birth-age]` element gets its years recalculated here on load.
 * Only the numbers are touched: the label and the "und jünger" suffix are
 * data-i18n nodes the language toggle owns, and the singular/plural shape follows
 * the sport, which no date can change.
 *
 * The arithmetic below MIRRORS src/lib/birthYears.ts — read the rules (and why the
 * two sports differ by a year) there. tests/unit/birth-years.test.ts runs this
 * file's copy against the TypeScript one and fails if they drift.
 *
 * Also exposes window.kscwBirthYears so public/js/team-page.js can build the same
 * line for the JS-rendered volleyball youth heroes without a second copy.
 */
(function () {
  'use strict';

  // How far the oldest eligible Jahrgang sits from `seasonYear - age`.
  var OFFSET = { basketball: 1, volleyball: 2 };

  // The season a date belongs to, named by its first calendar year: 2026 = 2026/27.
  // UTC so this and the build (CI, UTC) never disagree about which season it is.
  function seasonStartYear(now) {
    return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  }

  function birthYears(sport, age, seasonYear, spanTo) {
    var offset = OFFSET[sport] || OFFSET.basketball;
    var from = seasonYear - age + offset;
    // Volleyball is open-ended downwards — no second bound to compute.
    if (sport === 'volleyball') return { from: from, to: from, andYounger: true };
    var span = typeof spanTo === 'number' && spanTo < age ? spanTo : age;
    return { from: from, to: seasonYear - span + offset + 1, andYounger: false };
  }

  function formatBirthYears(y) {
    if (y.andYounger || y.to <= y.from) return String(y.from);
    if (y.to === y.from + 1) return y.from + ', ' + y.to;
    return y.from + '–' + y.to;
  }

  /** The years text for one age category, or '' when the inputs make no sense. */
  function textFor(sport, age, spanTo) {
    if (!(age > 0)) return '';
    return formatBirthYears(birthYears(sport, age, seasonStartYear(new Date()), spanTo));
  }

  // Mirror of youthAge() in src/lib/birthYears.ts — the U-number in a team name
  // ("DU23-1" → 23). No \b before the U: the gender prefix in "HU18" is a word
  // character, so a boundary there matches nothing.
  function youthAge(name) {
    var m = /U\s*0*(\d+)/i.exec(String(name == null ? '' : name));
    return m ? Number(m[1]) : null;
  }

  function label(key, german) {
    var el = document.createElement('strong');
    el.setAttribute('data-i18n', key);
    el.textContent = (window.i18n && window.i18n.t) ? window.i18n.t(key) : german;
    return el;
  }

  /**
   * The whole line as a detached element, for pages that render their team in the
   * browser (public/js/team-page.js builds the volleyball youth heroes). Same
   * markup and same data-birth-* attributes as BirthYears.astro, so the styling
   * and the refresh pass above both apply unchanged. Returns null when there is no
   * age category to state.
   */
  function element(sport, age, spanTo) {
    var text = textFor(sport, age, spanTo);
    if (!text) return null;
    var spec = birthYears(sport, age, seasonStartYear(new Date()), spanTo);

    var wrap = document.createElement('span');
    wrap.className = 'birth-years';
    wrap.setAttribute('data-birth-sport', sport);
    wrap.setAttribute('data-birth-age', String(age));
    wrap.setAttribute('data-birth-span', String(typeof spanTo === 'number' ? spanTo : age));

    wrap.appendChild(spec.andYounger
      ? label('youthBirthYear', 'Jahrgang:')
      : label('youthBirthYears', 'Jahrgänge:'));

    var value = document.createElement('span');
    value.className = 'birth-years-value';
    value.textContent = text;
    wrap.appendChild(value);

    if (spec.andYounger) {
      var younger = document.createElement('span');
      younger.setAttribute('data-i18n', 'youthBirthYearsYounger');
      younger.textContent = (window.i18n && window.i18n.t)
        ? window.i18n.t('youthBirthYearsYounger') : 'und jünger';
      wrap.appendChild(younger);
    }
    return wrap;
  }

  /**
   * Rewrite the years inside one already-rendered line. Leaves the element alone
   * when it carries no value node — the build and team-page.js both create one, so
   * a missing node means markup we do not recognise, and guessing is worse.
   */
  function refresh(el) {
    var value = el.querySelector('.birth-years-value');
    if (!value) return;
    var age = Number(el.getAttribute('data-birth-age'));
    var spanAttr = el.getAttribute('data-birth-span');
    var text = textFor(
      el.getAttribute('data-birth-sport') || 'basketball',
      age,
      spanAttr === null ? age : Number(spanAttr)
    );
    if (text) value.textContent = text;
  }

  function refreshAll(root) {
    var nodes = (root || document).querySelectorAll('[data-birth-age]');
    for (var i = 0; i < nodes.length; i++) refresh(nodes[i]);
  }

  window.kscwBirthYears = {
    seasonStartYear: seasonStartYear,
    birthYears: birthYears,
    format: formatBirthYears,
    text: textFor,
    youthAge: youthAge,
    element: element,
    refresh: refresh,
    refreshAll: refreshAll
  };

  refreshAll();
})();
