/**
 * KSCW Registration Form — Membership Type Switching + File Upload + Submission
 *
 * Reads URL params (?type=volleyball) to pre-fill membership type.
 * Fetches active teams from Directus when a sport type is selected.
 * Submits to POST /kscw/registration with Turnstile CAPTCHA (multipart/form-data).
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';

  var form = document.getElementById('registration-form');
  var feedback = document.getElementById('form-feedback');
  var submitBtn = form ? form.querySelector('.form-submit') : null;
  var vbFields = document.getElementById('vb-fields');
  var bbFields = document.getElementById('bb-fields');
  var locale = document.documentElement.lang || 'de';

  if (!form) return;

  // Surface client-side submit blocks (validation / expired captcha) into the
  // error log via the console.error capture in error-logger.js, so silent
  // "it didn't work" reports become diagnosable. Prefixed for easy filtering.
  function logBlock(reason) {
    try { console.error('[registration] ' + reason); } catch (_) { /* noop */ }
  }

  // ── Country data (ISO code → dial code, DE name, EN name) ──────────
  var FAVORITE_CODES = ['CH', 'DE', 'FR', 'AT', 'IT'];

  var COUNTRIES = [
    { code: 'AF', dial: '+93', de: 'Afghanistan', en: 'Afghanistan' },
    { code: 'EG', dial: '+20', de: 'Ägypten', en: 'Egypt' },
    { code: 'AL', dial: '+355', de: 'Albanien', en: 'Albania' },
    { code: 'DZ', dial: '+213', de: 'Algerien', en: 'Algeria' },
    { code: 'AD', dial: '+376', de: 'Andorra', en: 'Andorra' },
    { code: 'AO', dial: '+244', de: 'Angola', en: 'Angola' },
    { code: 'AG', dial: '+1-268', de: 'Antigua und Barbuda', en: 'Antigua and Barbuda' },
    { code: 'GQ', dial: '+240', de: 'Äquatorialguinea', en: 'Equatorial Guinea' },
    { code: 'AR', dial: '+54', de: 'Argentinien', en: 'Argentina' },
    { code: 'AM', dial: '+374', de: 'Armenien', en: 'Armenia' },
    { code: 'AZ', dial: '+994', de: 'Aserbaidschan', en: 'Azerbaijan' },
    { code: 'ET', dial: '+251', de: 'Äthiopien', en: 'Ethiopia' },
    { code: 'AU', dial: '+61', de: 'Australien', en: 'Australia' },
    { code: 'BS', dial: '+1-242', de: 'Bahamas', en: 'Bahamas' },
    { code: 'BH', dial: '+973', de: 'Bahrain', en: 'Bahrain' },
    { code: 'BD', dial: '+880', de: 'Bangladesch', en: 'Bangladesh' },
    { code: 'BB', dial: '+1-246', de: 'Barbados', en: 'Barbados' },
    { code: 'BY', dial: '+375', de: 'Belarus', en: 'Belarus' },
    { code: 'BE', dial: '+32', de: 'Belgien', en: 'Belgium' },
    { code: 'BZ', dial: '+501', de: 'Belize', en: 'Belize' },
    { code: 'BJ', dial: '+229', de: 'Benin', en: 'Benin' },
    { code: 'BT', dial: '+975', de: 'Bhutan', en: 'Bhutan' },
    { code: 'BO', dial: '+591', de: 'Bolivien', en: 'Bolivia' },
    { code: 'BA', dial: '+387', de: 'Bosnien und Herzegowina', en: 'Bosnia and Herzegovina' },
    { code: 'BW', dial: '+267', de: 'Botswana', en: 'Botswana' },
    { code: 'BR', dial: '+55', de: 'Brasilien', en: 'Brazil' },
    { code: 'BN', dial: '+673', de: 'Brunei', en: 'Brunei' },
    { code: 'BG', dial: '+359', de: 'Bulgarien', en: 'Bulgaria' },
    { code: 'BF', dial: '+226', de: 'Burkina Faso', en: 'Burkina Faso' },
    { code: 'BI', dial: '+257', de: 'Burundi', en: 'Burundi' },
    { code: 'CL', dial: '+56', de: 'Chile', en: 'Chile' },
    { code: 'CN', dial: '+86', de: 'China', en: 'China' },
    { code: 'CR', dial: '+506', de: 'Costa Rica', en: 'Costa Rica' },
    { code: 'CI', dial: '+225', de: 'Côte d\'Ivoire', en: 'Côte d\'Ivoire' },
    { code: 'DK', dial: '+45', de: 'Dänemark', en: 'Denmark' },
    { code: 'DE', dial: '+49', de: 'Deutschland', en: 'Germany' },
    { code: 'DM', dial: '+1-767', de: 'Dominica', en: 'Dominica' },
    { code: 'DO', dial: '+1-809', de: 'Dominikanische Republik', en: 'Dominican Republic' },
    { code: 'DJ', dial: '+253', de: 'Dschibuti', en: 'Djibouti' },
    { code: 'EC', dial: '+593', de: 'Ecuador', en: 'Ecuador' },
    { code: 'SV', dial: '+503', de: 'El Salvador', en: 'El Salvador' },
    { code: 'ER', dial: '+291', de: 'Eritrea', en: 'Eritrea' },
    { code: 'EE', dial: '+372', de: 'Estland', en: 'Estonia' },
    { code: 'SZ', dial: '+268', de: 'Eswatini', en: 'Eswatini' },
    { code: 'FJ', dial: '+679', de: 'Fidschi', en: 'Fiji' },
    { code: 'FI', dial: '+358', de: 'Finnland', en: 'Finland' },
    { code: 'FR', dial: '+33', de: 'Frankreich', en: 'France' },
    { code: 'GA', dial: '+241', de: 'Gabun', en: 'Gabon' },
    { code: 'GM', dial: '+220', de: 'Gambia', en: 'Gambia' },
    { code: 'GE', dial: '+995', de: 'Georgien', en: 'Georgia' },
    { code: 'GH', dial: '+233', de: 'Ghana', en: 'Ghana' },
    { code: 'GD', dial: '+1-473', de: 'Grenada', en: 'Grenada' },
    { code: 'GR', dial: '+30', de: 'Griechenland', en: 'Greece' },
    { code: 'GT', dial: '+502', de: 'Guatemala', en: 'Guatemala' },
    { code: 'GN', dial: '+224', de: 'Guinea', en: 'Guinea' },
    { code: 'GW', dial: '+245', de: 'Guinea-Bissau', en: 'Guinea-Bissau' },
    { code: 'GY', dial: '+592', de: 'Guyana', en: 'Guyana' },
    { code: 'HT', dial: '+509', de: 'Haiti', en: 'Haiti' },
    { code: 'HN', dial: '+504', de: 'Honduras', en: 'Honduras' },
    { code: 'IN', dial: '+91', de: 'Indien', en: 'India' },
    { code: 'ID', dial: '+62', de: 'Indonesien', en: 'Indonesia' },
    { code: 'IQ', dial: '+964', de: 'Irak', en: 'Iraq' },
    { code: 'IR', dial: '+98', de: 'Iran', en: 'Iran' },
    { code: 'IE', dial: '+353', de: 'Irland', en: 'Ireland' },
    { code: 'IS', dial: '+354', de: 'Island', en: 'Iceland' },
    { code: 'IL', dial: '+972', de: 'Israel', en: 'Israel' },
    { code: 'IT', dial: '+39', de: 'Italien', en: 'Italy' },
    { code: 'JM', dial: '+1-876', de: 'Jamaika', en: 'Jamaica' },
    { code: 'JP', dial: '+81', de: 'Japan', en: 'Japan' },
    { code: 'YE', dial: '+967', de: 'Jemen', en: 'Yemen' },
    { code: 'JO', dial: '+962', de: 'Jordanien', en: 'Jordan' },
    { code: 'KH', dial: '+855', de: 'Kambodscha', en: 'Cambodia' },
    { code: 'CM', dial: '+237', de: 'Kamerun', en: 'Cameroon' },
    { code: 'CA', dial: '+1', de: 'Kanada', en: 'Canada' },
    { code: 'CV', dial: '+238', de: 'Kap Verde', en: 'Cape Verde' },
    { code: 'KZ', dial: '+7', de: 'Kasachstan', en: 'Kazakhstan' },
    { code: 'QA', dial: '+974', de: 'Katar', en: 'Qatar' },
    { code: 'KE', dial: '+254', de: 'Kenia', en: 'Kenya' },
    { code: 'KG', dial: '+996', de: 'Kirgisistan', en: 'Kyrgyzstan' },
    { code: 'KI', dial: '+686', de: 'Kiribati', en: 'Kiribati' },
    { code: 'CO', dial: '+57', de: 'Kolumbien', en: 'Colombia' },
    { code: 'KM', dial: '+269', de: 'Komoren', en: 'Comoros' },
    { code: 'CD', dial: '+243', de: 'Kongo (Dem. Rep.)', en: 'Congo (DRC)' },
    { code: 'CG', dial: '+242', de: 'Kongo (Rep.)', en: 'Congo (Republic)' },
    { code: 'XK', dial: '+383', de: 'Kosovo', en: 'Kosovo' },
    { code: 'HR', dial: '+385', de: 'Kroatien', en: 'Croatia' },
    { code: 'CU', dial: '+53', de: 'Kuba', en: 'Cuba' },
    { code: 'KW', dial: '+965', de: 'Kuwait', en: 'Kuwait' },
    { code: 'LA', dial: '+856', de: 'Laos', en: 'Laos' },
    { code: 'LS', dial: '+266', de: 'Lesotho', en: 'Lesotho' },
    { code: 'LV', dial: '+371', de: 'Lettland', en: 'Latvia' },
    { code: 'LB', dial: '+961', de: 'Libanon', en: 'Lebanon' },
    { code: 'LR', dial: '+231', de: 'Liberia', en: 'Liberia' },
    { code: 'LY', dial: '+218', de: 'Libyen', en: 'Libya' },
    { code: 'LI', dial: '+423', de: 'Liechtenstein', en: 'Liechtenstein' },
    { code: 'LT', dial: '+370', de: 'Litauen', en: 'Lithuania' },
    { code: 'LU', dial: '+352', de: 'Luxemburg', en: 'Luxembourg' },
    { code: 'MG', dial: '+261', de: 'Madagaskar', en: 'Madagascar' },
    { code: 'MW', dial: '+265', de: 'Malawi', en: 'Malawi' },
    { code: 'MY', dial: '+60', de: 'Malaysia', en: 'Malaysia' },
    { code: 'MV', dial: '+960', de: 'Malediven', en: 'Maldives' },
    { code: 'ML', dial: '+223', de: 'Mali', en: 'Mali' },
    { code: 'MT', dial: '+356', de: 'Malta', en: 'Malta' },
    { code: 'MA', dial: '+212', de: 'Marokko', en: 'Morocco' },
    { code: 'MH', dial: '+692', de: 'Marshallinseln', en: 'Marshall Islands' },
    { code: 'MR', dial: '+222', de: 'Mauretanien', en: 'Mauritania' },
    { code: 'MU', dial: '+230', de: 'Mauritius', en: 'Mauritius' },
    { code: 'MX', dial: '+52', de: 'Mexiko', en: 'Mexico' },
    { code: 'FM', dial: '+691', de: 'Mikronesien', en: 'Micronesia' },
    { code: 'MD', dial: '+373', de: 'Moldau', en: 'Moldova' },
    { code: 'MC', dial: '+377', de: 'Monaco', en: 'Monaco' },
    { code: 'MN', dial: '+976', de: 'Mongolei', en: 'Mongolia' },
    { code: 'ME', dial: '+382', de: 'Montenegro', en: 'Montenegro' },
    { code: 'MZ', dial: '+258', de: 'Mosambik', en: 'Mozambique' },
    { code: 'MM', dial: '+95', de: 'Myanmar', en: 'Myanmar' },
    { code: 'NA', dial: '+264', de: 'Namibia', en: 'Namibia' },
    { code: 'NR', dial: '+674', de: 'Nauru', en: 'Nauru' },
    { code: 'NP', dial: '+977', de: 'Nepal', en: 'Nepal' },
    { code: 'NZ', dial: '+64', de: 'Neuseeland', en: 'New Zealand' },
    { code: 'NI', dial: '+505', de: 'Nicaragua', en: 'Nicaragua' },
    { code: 'NL', dial: '+31', de: 'Niederlande', en: 'Netherlands' },
    { code: 'NE', dial: '+227', de: 'Niger', en: 'Niger' },
    { code: 'NG', dial: '+234', de: 'Nigeria', en: 'Nigeria' },
    { code: 'KP', dial: '+850', de: 'Nordkorea', en: 'North Korea' },
    { code: 'MK', dial: '+389', de: 'Nordmazedonien', en: 'North Macedonia' },
    { code: 'NO', dial: '+47', de: 'Norwegen', en: 'Norway' },
    { code: 'OM', dial: '+968', de: 'Oman', en: 'Oman' },
    { code: 'AT', dial: '+43', de: 'Österreich', en: 'Austria' },
    { code: 'PK', dial: '+92', de: 'Pakistan', en: 'Pakistan' },
    { code: 'PW', dial: '+680', de: 'Palau', en: 'Palau' },
    { code: 'PS', dial: '+970', de: 'Palästina', en: 'Palestine' },
    { code: 'PA', dial: '+507', de: 'Panama', en: 'Panama' },
    { code: 'PG', dial: '+675', de: 'Papua-Neuguinea', en: 'Papua New Guinea' },
    { code: 'PY', dial: '+595', de: 'Paraguay', en: 'Paraguay' },
    { code: 'PE', dial: '+51', de: 'Peru', en: 'Peru' },
    { code: 'PH', dial: '+63', de: 'Philippinen', en: 'Philippines' },
    { code: 'PL', dial: '+48', de: 'Polen', en: 'Poland' },
    { code: 'PT', dial: '+351', de: 'Portugal', en: 'Portugal' },
    { code: 'RW', dial: '+250', de: 'Ruanda', en: 'Rwanda' },
    { code: 'RO', dial: '+40', de: 'Rumänien', en: 'Romania' },
    { code: 'RU', dial: '+7', de: 'Russland', en: 'Russia' },
    { code: 'SB', dial: '+677', de: 'Salomonen', en: 'Solomon Islands' },
    { code: 'ZM', dial: '+260', de: 'Sambia', en: 'Zambia' },
    { code: 'WS', dial: '+685', de: 'Samoa', en: 'Samoa' },
    { code: 'SM', dial: '+378', de: 'San Marino', en: 'San Marino' },
    { code: 'ST', dial: '+239', de: 'São Tomé und Príncipe', en: 'São Tomé and Príncipe' },
    { code: 'SA', dial: '+966', de: 'Saudi-Arabien', en: 'Saudi Arabia' },
    { code: 'SE', dial: '+46', de: 'Schweden', en: 'Sweden' },
    { code: 'CH', dial: '+41', de: 'Schweiz', en: 'Switzerland' },
    { code: 'SN', dial: '+221', de: 'Senegal', en: 'Senegal' },
    { code: 'RS', dial: '+381', de: 'Serbien', en: 'Serbia' },
    { code: 'SC', dial: '+248', de: 'Seychellen', en: 'Seychelles' },
    { code: 'SL', dial: '+232', de: 'Sierra Leone', en: 'Sierra Leone' },
    { code: 'SG', dial: '+65', de: 'Singapur', en: 'Singapore' },
    { code: 'SK', dial: '+421', de: 'Slowakei', en: 'Slovakia' },
    { code: 'SI', dial: '+386', de: 'Slowenien', en: 'Slovenia' },
    { code: 'SO', dial: '+252', de: 'Somalia', en: 'Somalia' },
    { code: 'ES', dial: '+34', de: 'Spanien', en: 'Spain' },
    { code: 'LK', dial: '+94', de: 'Sri Lanka', en: 'Sri Lanka' },
    { code: 'KN', dial: '+1-869', de: 'St. Kitts und Nevis', en: 'Saint Kitts and Nevis' },
    { code: 'LC', dial: '+1-758', de: 'St. Lucia', en: 'Saint Lucia' },
    { code: 'VC', dial: '+1-784', de: 'St. Vincent und die Grenadinen', en: 'Saint Vincent and the Grenadines' },
    { code: 'ZA', dial: '+27', de: 'Südafrika', en: 'South Africa' },
    { code: 'SD', dial: '+249', de: 'Sudan', en: 'Sudan' },
    { code: 'KR', dial: '+82', de: 'Südkorea', en: 'South Korea' },
    { code: 'SS', dial: '+211', de: 'Südsudan', en: 'South Sudan' },
    { code: 'SR', dial: '+597', de: 'Suriname', en: 'Suriname' },
    { code: 'SY', dial: '+963', de: 'Syrien', en: 'Syria' },
    { code: 'TJ', dial: '+992', de: 'Tadschikistan', en: 'Tajikistan' },
    { code: 'TW', dial: '+886', de: 'Taiwan', en: 'Taiwan' },
    { code: 'TZ', dial: '+255', de: 'Tansania', en: 'Tanzania' },
    { code: 'TH', dial: '+66', de: 'Thailand', en: 'Thailand' },
    { code: 'TL', dial: '+670', de: 'Timor-Leste', en: 'Timor-Leste' },
    { code: 'TG', dial: '+228', de: 'Togo', en: 'Togo' },
    { code: 'TO', dial: '+676', de: 'Tonga', en: 'Tonga' },
    { code: 'TT', dial: '+1-868', de: 'Trinidad und Tobago', en: 'Trinidad and Tobago' },
    { code: 'TD', dial: '+235', de: 'Tschad', en: 'Chad' },
    { code: 'CZ', dial: '+420', de: 'Tschechien', en: 'Czech Republic' },
    { code: 'TN', dial: '+216', de: 'Tunesien', en: 'Tunisia' },
    { code: 'TR', dial: '+90', de: 'Türkei', en: 'Turkey' },
    { code: 'TM', dial: '+993', de: 'Turkmenistan', en: 'Turkmenistan' },
    { code: 'TV', dial: '+688', de: 'Tuvalu', en: 'Tuvalu' },
    { code: 'UG', dial: '+256', de: 'Uganda', en: 'Uganda' },
    { code: 'UA', dial: '+380', de: 'Ukraine', en: 'Ukraine' },
    { code: 'HU', dial: '+36', de: 'Ungarn', en: 'Hungary' },
    { code: 'UY', dial: '+598', de: 'Uruguay', en: 'Uruguay' },
    { code: 'UZ', dial: '+998', de: 'Usbekistan', en: 'Uzbekistan' },
    { code: 'VU', dial: '+678', de: 'Vanuatu', en: 'Vanuatu' },
    { code: 'VA', dial: '+39', de: 'Vatikanstadt', en: 'Vatican City' },
    { code: 'VE', dial: '+58', de: 'Venezuela', en: 'Venezuela' },
    { code: 'AE', dial: '+971', de: 'Vereinigte Arabische Emirate', en: 'United Arab Emirates' },
    { code: 'US', dial: '+1', de: 'Vereinigte Staaten', en: 'United States' },
    { code: 'GB', dial: '+44', de: 'Vereinigtes Königreich', en: 'United Kingdom' },
    { code: 'VN', dial: '+84', de: 'Vietnam', en: 'Vietnam' },
    { code: 'CF', dial: '+236', de: 'Zentralafrikanische Republik', en: 'Central African Republic' },
    { code: 'CY', dial: '+357', de: 'Zypern', en: 'Cyprus' },
    { code: 'ZW', dial: '+263', de: 'Simbabwe', en: 'Zimbabwe' }
  ];

  function countryName(c) { return c[locale] || c.de; }

  // Emoji flag from the ISO alpha-2 code (A -> U+1F1E6). Decorative only: the
  // country name is always rendered beside it, which is what makes this degrade
  // gracefully on Windows, where Chrome/Edge draw the two regional-indicator
  // letters ("CH") instead of a flag glyph.
  function countryFlag(code) {
    if (!/^[A-Z]{2}$/.test(code || '')) return '';
    return String.fromCodePoint(
      0x1F1E6 + code.charCodeAt(0) - 65,
      0x1F1E6 + code.charCodeAt(1) - 65
    );
  }

  // Build sorted lists: favorites first, then alphabetical rest
  var favorites = COUNTRIES.filter(function (c) { return FAVORITE_CODES.indexOf(c.code) !== -1; });
  favorites.sort(function (a, b) { return FAVORITE_CODES.indexOf(a.code) - FAVORITE_CODES.indexOf(b.code); });
  var rest = COUNTRIES.filter(function (c) { return FAVORITE_CODES.indexOf(c.code) === -1; });
  rest.sort(function (a, b) { return countryName(a).localeCompare(countryName(b), locale); });

  // ── Searchable nationality dropdown (multi-select) ───────────
  // Dual/multiple nationals pick every passport they hold. Selection ORDER is
  // meaningful: the first pick is the primary one, and it is the single value
  // ClubDesk's Nationalität picklist receives.
  var natWrapper = document.getElementById('nationality-wrapper');
  var natTrigger = document.getElementById('nationality-trigger');
  var natTriggerText = document.getElementById('nationality-trigger-text');
  var natDropdown = document.getElementById('nationality-dropdown');
  var natSearch = document.getElementById('nationality-search');
  var natOptions = document.getElementById('nationality-options');
  var natHidden = document.getElementById('nationalitaet');
  var natCodesHidden = document.getElementById('nationalitaet_codes');
  var natChips = document.getElementById('nationality-chips');

  // Ordered ISO alpha-2 codes, in the order the applicant picked them.
  var natCodes = [];

  function countryByCode(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i];
    return null;
  }

  /**
   * The nationality code the basketball document rules should use. A player who
   * holds Swiss nationality alongside another is Swiss for FIBA purposes, so any
   * CH in the set wins; otherwise the primary (first) pick applies. The backend
   * applies the same rule, and the two MUST agree — if the form shows a shorter
   * document list than the server enforces, the submission is rejected after the
   * applicant has already uploaded everything.
   */
  function bbNatCode() {
    if (natCodes.indexOf('CH') !== -1) return 'CH';
    return natCodes[0] || '';
  }

  // Keep the hidden inputs + chips in step with `natCodes`. `nationalitaet`
  // carries the localized display names (what a human reads in the admin UI and
  // the ClubDesk CSV); `nationalitaet_codes` carries the canonical codes.
  function syncNationality() {
    var names = [];
    for (var i = 0; i < natCodes.length; i++) {
      var c = countryByCode(natCodes[i]);
      if (c) names.push(countryName(c));
    }
    natHidden.value = names.join(', ');
    // Primary code only — the "CH if any" widening is a basketball-document rule,
    // not a change to which nationality is primary.
    natHidden.dataset.code = natCodes[0] || '';
    if (natCodesHidden) natCodesHidden.value = natCodes.join(',');
    natTriggerText.textContent = names.length ? names.join(', ') : '—';

    if (natChips) {
      natChips.innerHTML = '';
      for (var j = 0; j < natCodes.length; j++) {
        (function (code) {
          var c = countryByCode(code);
          if (!c) return;
          var chip = document.createElement('span');
          chip.className = 'country-chip';
          var chipFlag = countryFlag(c.code);
          chip.appendChild(document.createTextNode(
            (chipFlag ? chipFlag + ' ' : '') + countryName(c)));
          var x = document.createElement('button');
          x.type = 'button';
          x.textContent = '×';
          x.setAttribute('aria-label', (locale === 'de' ? 'Entfernen: ' : 'Remove: ') + countryName(c));
          x.addEventListener('click', function () { toggleNationality(code); });
          chip.appendChild(x);
          natChips.appendChild(chip);
        })(natCodes[j]);
      }
    }
  }

  function renderNationalityOptions(filter) {
    natOptions.innerHTML = '';
    var q = (filter || '').toLowerCase();

    function addOption(c) {
      var name = countryName(c);
      if (q && name.toLowerCase().indexOf(q) === -1 && c.code.toLowerCase().indexOf(q) === -1) return false;
      var div = document.createElement('div');
      div.className = 'nationality-opt' + (natCodes.indexOf(c.code) !== -1 ? ' selected' : '');
      var fl = countryFlag(c.code);
      div.textContent = fl ? fl + ' ' + name : name;
      div.dataset.value = name;
      div.dataset.code = c.code;
      div.addEventListener('click', function () { toggleNationality(c.code); });
      natOptions.appendChild(div);
      return true;
    }

    // Favorites
    var anyFav = false;
    for (var i = 0; i < favorites.length; i++) {
      if (addOption(favorites[i])) anyFav = true;
    }

    // Divider
    if (anyFav && !q) {
      var hr = document.createElement('hr');
      hr.className = 'nationality-divider';
      natOptions.appendChild(hr);
    }

    // Rest
    for (var j = 0; j < rest.length; j++) {
      addOption(rest[j]);
    }
  }

  function toggleNationality(code) {
    var at = natCodes.indexOf(code);
    if (at === -1) natCodes.push(code); else natCodes.splice(at, 1);
    syncNationality();
    // The list stays open — picking a second passport shouldn't cost another tap.
    renderNationalityOptions(natSearch ? natSearch.value : '');
    // Nationality feeds into the basketball document set (Player Self Declaration
    // for foreign new players, etc.).
    updateBBDocs();
  }

  // Situation selector, licence history and date of birth all drive the
  // basketball document set.
  form.querySelectorAll('input[name="bb_situation"]').forEach(function (r) {
    r.addEventListener('change', updateBBDocs);
  });
  // Switching sport changes which federation set the picker shows, and clears any
  // pick made under the old sport — the stored code would otherwise keep a label
  // ("FIPAV") that no longer matches the selected membership type.
  form.querySelectorAll('input[name="membership_type"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (fedHidden) fedHidden.value = '';
      if (fedTriggerText) fedTriggerText.textContent = '—';
      if (fedWrapper && fedWrapper.classList.contains('open')) renderFederationOptions('');
    });
  });
  form.querySelectorAll('input[name="bb_recent_licence"]').forEach(function (r) {
    r.addEventListener('change', updateBBDocs);
  });
  var geburtsdatumEl = document.getElementById('geburtsdatum');
  if (geburtsdatumEl) geburtsdatumEl.addEventListener('change', updateBBDocs);

  if (natTrigger) {
    natTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = natWrapper.classList.toggle('open');
      if (isOpen) {
        renderNationalityOptions('');
        natSearch.focus();
      }
    });
  }

  if (natSearch) {
    natSearch.addEventListener('input', function () {
      renderNationalityOptions(natSearch.value);
    });
    natSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        natWrapper.classList.remove('open');
      }
    });
  }


  // National federation names for the federation-of-origin picker, per sport.
  // "Federation of origin" asks which BODY first licensed the applicant, and the
  // answer is sport-specific: an Italian volleyballer came from FIPAV, an Italian
  // basketballer from FIP. Not exhaustive — anything absent falls back to the
  // country name, which is still correct, just less specific.
  var FEDERATIONS = {
    volleyball: {
      AF: 'Afghanistan Volleyball Federation', AL: 'FSHV', AT: 'ÖVV', AU: 'Volleyball Australia',
      BG: 'Bulgarian Volleyball Federation', BR: 'CBV', CH: 'Swiss Volley', CO: 'Fedevoley',
      CZ: 'Český volejbalový svaz', DE: 'DVV', ES: 'RFEVB', ET: 'Ethiopian Volleyball Federation',
      FI: 'Lentopalloliitto', FR: 'FFVB', GB: 'Volleyball England', GR: 'Hellenic Volleyball Federation',
      HU: 'Magyar Röplabda Szövetség', IQ: 'Iraqi Volleyball Federation', IR: 'IRIVF', IT: 'FIPAV',
      LK: 'Sri Lanka Volleyball Federation', MX: 'FMVB', NL: 'Nevobo', NZ: 'Volleyball New Zealand',
      PE: 'FPV', PL: 'PZPS', PT: 'FPV', RS: 'OSS', RU: 'Russian Volleyball Federation',
      SE: 'Svenska Volleybollförbundet', SI: 'OZS', US: 'USA Volleyball'
    },
    basketball: {
      AF: 'Afghanistan Basketball Federation', AL: 'FSHB', AT: 'ÖBV', AU: 'Basketball Australia',
      BG: 'Bulgarian Basketball Federation', BR: 'CBB', CH: 'Swiss Basketball', CO: 'Fecolcesto',
      CZ: 'Česká basketbalová federace', DE: 'DBB', ES: 'FEB', ET: 'Ethiopian Basketball Federation',
      FI: 'Basketball Finland', FR: 'FFBB', GB: 'Basketball England', GR: 'Hellenic Basketball Federation',
      HU: 'MKOSZ', IQ: 'Iraq Basketball Federation', IR: 'IRIBF', IT: 'FIP',
      LK: 'Sri Lanka Basketball Federation', MX: 'ADEMEBA', NL: 'NBB', NZ: 'Basketball New Zealand',
      PE: 'FDPB', PL: 'PZKosz', PT: 'FPB', RS: 'KSS', RU: 'Russian Basketball Federation',
      SE: 'Svenska Basketbollförbundet', SI: 'KZS', US: 'USA Basketball'
    }
  };

  // The membership type drives which federation set applies. Passive members pick
  // no sport, so they see plain country names.
  function fedSport() {
    var r = form.querySelector('input[name="membership_type"]:checked');
    var v = r ? r.value : '';
    return (v === 'volleyball' || v === 'basketball') ? v : '';
  }

  function federationLabelFor(code, countryLabelText) {
    var sport = fedSport();
    var fed = sport && FEDERATIONS[sport] ? FEDERATIONS[sport][code] : '';
    return fed ? fed + ' (' + countryLabelText + ')' : countryLabelText;
  }

  // ── Federation of origin (single-select) ─────────────────────
  // The national federation the player was FIRST licensed with — their
  // federation of origin, not the most recent one. Unlike
  // nationality this is optional, and "none" is a real answer — it tells the
  // club there is no transfer certificate to chase, which a blank does not.
  var fedWrapper = document.getElementById('federation-wrapper');
  var fedTrigger = document.getElementById('federation-trigger');
  var fedTriggerText = document.getElementById('federation-trigger-text');
  var fedSearch = document.getElementById('federation-search');
  var fedOptions = document.getElementById('federation-options');
  var fedHidden = document.getElementById('federation_of_origin');

  // Sentinel stored verbatim; the backend and members.federation_of_origin use
  // the same literal.
  var FED_NONE = 'NONE';

  function fedNoneLabel() {
    // FIVB Sports Regulations, via Swiss Volley: the federation of origin is the
    // association that licensed the person AT AGE 14 — not wherever they first
    // played. So this option is about age 14 specifically, and it is also the
    // point where recreational bodies drop out: Italy's CSI, UISP and PGS are
    // CONI promotion bodies, not FIVB/FIBA members, so they never licensed anyone
    // in the sense that matters and there is nothing to transfer.
    return locale === 'de'
      ? 'Keiner / mit 14 bei keinem nationalen Verband lizenziert'
      : 'None / not licensed with a national federation at 14';
  }

  function selectFederation(value, label) {
    fedHidden.value = value;
    var selFlag = countryFlag(value);
    fedTriggerText.textContent = selFlag ? selFlag + ' ' + label : label;
    fedWrapper.classList.remove('open');
    if (fedSearch) fedSearch.value = '';
  }

  function renderFederationOptions(filter) {
    if (!fedOptions) return;
    fedOptions.innerHTML = '';
    var q = (filter || '').toLowerCase();

    function addOpt(value, label) {
      if (q && label.toLowerCase().indexOf(q) === -1 && value.toLowerCase().indexOf(q) === -1) return false;
      var div = document.createElement('div');
      div.className = 'nationality-opt' + (fedHidden.value === value ? ' selected' : '');
      // Search matched the plain label above, so the flag is added only now —
      // typing "sui" must not have to get past a flag character.
      var optFlag = countryFlag(value);
      var shown = value === FED_NONE ? label : federationLabelFor(value, label);
      div.textContent = optFlag ? optFlag + ' ' + shown : shown;
      div.dataset.shown = shown;
      div.addEventListener('click', function () { selectFederation(value, shown); });
      fedOptions.appendChild(div);
      return true;
    }

    var anyTop = addOpt(FED_NONE, fedNoneLabel());
    var anyFav = false;
    for (var i = 0; i < favorites.length; i++) {
      if (addOpt(favorites[i].code, countryName(favorites[i]))) anyFav = true;
    }
    if ((anyTop || anyFav) && !q) {
      var hr = document.createElement('hr');
      hr.className = 'nationality-divider';
      fedOptions.appendChild(hr);
    }
    for (var j = 0; j < rest.length; j++) {
      addOpt(rest[j].code, countryName(rest[j]));
    }
  }

  if (fedTrigger) {
    fedTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = fedWrapper.classList.toggle('open');
      if (isOpen) {
        renderFederationOptions('');
        if (fedSearch) fedSearch.focus();
      }
    });
  }

  if (fedSearch) {
    fedSearch.addEventListener('input', function () {
      renderFederationOptions(fedSearch.value);
    });
    fedSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fedWrapper.classList.remove('open');
    });
  }

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (natWrapper && !natWrapper.contains(e.target)) {
      natWrapper.classList.remove('open');
    }
    if (fedWrapper && !fedWrapper.contains(e.target)) {
      fedWrapper.classList.remove('open');
    }
  });

  // ── Phone country code dropdown ──────────────────────────────
  var phoneInput = document.getElementById('telefon');
  if (phoneInput) {
    // Wrap the existing input in a phone group
    var phoneGroup = phoneInput.parentElement;
    var phoneRow = document.createElement('div');
    phoneRow.style.cssText = 'display: flex; gap: 0;';

    var phoneSelect = document.createElement('select');
    phoneSelect.className = 'form-select';
    phoneSelect.id = 'phone-country';
    phoneSelect.style.cssText = 'width: 5.5rem; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: none; flex-shrink: 0; padding: 0.75rem 0.25rem 0.75rem 0.75rem; font-size: var(--text-base);';

    // Build phone options: use ISO code as value for uniqueness, show dial code
    function addPhoneOpt(c) {
      var opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.dial;
      opt.dataset.dial = c.dial;
      phoneSelect.appendChild(opt);
    }
    for (var pi = 0; pi < favorites.length; pi++) addPhoneOpt(favorites[pi]);
    var divOpt = document.createElement('option');
    divOpt.disabled = true;
    divOpt.textContent = '────';
    phoneSelect.appendChild(divOpt);
    var restByDial = rest.slice().sort(function (a, b) {
      var da = parseInt(a.dial.replace('+', ''), 10);
      var db = parseInt(b.dial.replace('+', ''), 10);
      return da - db;
    });
    for (var pj = 0; pj < restByDial.length; pj++) addPhoneOpt(restByDial[pj]);

    // Default to CH
    phoneSelect.value = 'CH';

    phoneInput.style.cssText = 'border-top-left-radius: 0; border-bottom-left-radius: 0; flex: 1; min-width: 0;';
    phoneInput.placeholder = '79 123 45 67';

    phoneRow.appendChild(phoneSelect);
    phoneRow.appendChild(phoneInput);
    phoneGroup.appendChild(phoneRow);
  }

  // ── Auto-derive Anrede from Geschlecht ───────────────────────
  var geschlechtSelect = document.getElementById('geschlecht');
  var anredeHidden = document.getElementById('anrede');
  if (geschlechtSelect && anredeHidden) {
    geschlechtSelect.addEventListener('change', function () {
      if (geschlechtSelect.value === 'männlich') anredeHidden.value = 'Herr';
      else if (geschlechtSelect.value === 'weiblich') anredeHidden.value = 'Frau';
      else anredeHidden.value = '';
    });
  }

  // ── Basketball document set (situation + nationality + age driven) ──
  // Mirrors Swiss Basketball's "Liste der Dokumente für jeden Fall" (licensing
  // procedure, lizenzdokument.pdf). The applicant's *situation* — new / Swiss-club
  // transfer / from abroad / returner — plus nationality and whether they are a
  // minor (U18, FIBA minor-transfer rules) decide which documents are required.
  // ID front/back + signed Lizenzantrag are always required and handled elsewhere.
  // Kept in sync with the backend (wiedisync registration.js bbRequiredDocs()).
  var BB_SITUATIONS = ['neu', 'transfer_ch', 'transfer_intl', 'rueckkehr'];

  // Age at the start of the current season (Sept 1), or null when the date of
  // birth is missing or unparseable. Swiss Basketball states its document rules in
  // category terms (U18, U12 …); deriving the age here means the applicant answers
  // nothing extra and borderline birthdays resolve consistently at season start.
  function ageAtSeasonStart(dobStr) {
    if (!dobStr) return null;
    var p = String(dobStr).split('-');
    if (p.length !== 3) return null;
    var by = +p[0], bm = +p[1], bd = +p[2];
    if (!by || !bm || !bd) return null;
    var now = new Date();
    var seasonStartYear = (now.getMonth() + 1) >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    var ref = new Date(seasonStartYear, 8, 1); // Sept 1 of the season
    var age = ref.getFullYear() - by;
    if ((ref.getMonth() + 1) < bm || ((ref.getMonth() + 1) === bm && ref.getDate() < bd)) age--;
    return age;
  }

  // U18 = a minor at season start. Swiss Basketball's youth/minor documents
  // (Acknowledgment of National Team Restriction, parental consent, school
  // certificate) hinge on this.
  function isMinorFromDob(dobStr) {
    var age = ageAtSeasonStart(dobStr);
    return age !== null && age < 18;
  }

  // The Freibrief is waived for categories U12 and below. Swiss Basketball assigns
  // the category and its procedure document doesn't state the cut-off, so this
  // approximates it as "under 12 at season start", the same convention used for
  // U18 above. Deliberately strict: an unknown date of birth keeps the Freibrief
  // required, because wrongly waiving it produces an incomplete dossier.
  // The Freibrief waiver, enabled once the backend agreed with it.
  //
  // This gate exists because waiving client-side alone does not spare anyone the
  // document — it stops them registering. wiedisync's bbRequiredDocs() is enforced
  // at three points (create, doc-status, approval gate) and POST /kscw/registration
  // answers HTTP 400 when a required document is missing, so a form that waives
  // while the server still demands locks out exactly the applicants it meant to
  // help. That is what kscw-website 1.15.1 did.
  //
  // Both sides now implement the same rule: wiedisync bb-docs.js bbFreibriefWaived()
  // plus migration 232 (registrations.bb_recent_licence), live on dev and prod
  // since 2026-07-25. Keep them in step — if this rule changes, change it there
  // first, and only then here.
  var FREIBRIEF_WAIVER_ENABLED = true;

  function isYouthFreibriefExempt(dobStr) {
    if (!FREIBRIEF_WAIVER_ENABLED) return false;
    var age = ageAtSeasonStart(dobStr);
    return age !== null && age < 12;
  }

  // Returns { required: [...docKeys], optional: [...docKeys] } beyond the always-on
  // id_upload_front / id_upload_back / bb_doc_lizenz. docKeys are the short doc
  // ids used by data-doc / data-doc-upload attributes and the DOC_INPUTS map.
  function bbDocSet(situation, natCode, isMinor, dobStr, recentLicence) {
    var required = [];
    var optional = [];
    var foreign = natCode && natCode !== 'CH';
    switch (situation) {
      case 'transfer_ch':
        // Swiss Basketball waives the release letter in two cases: no licence in
        // the last two seasons (asked on the form — the previous club has nothing
        // to release), and categories U12 and below.
        if (!FREIBRIEF_WAIVER_ENABLED || (recentLicence !== 'nein' && !isYouthFreibriefExempt(dobStr))) required.push('freibrief');
        break;
      case 'transfer_intl':
      case 'rueckkehr':
        required.push('selfdecl');
        if (isMinor) { required.push('natdecl', 'u18parents'); optional.push('schoolcert'); }
        break;
      case 'neu':
      default:
        if (foreign) required.push('selfdecl');
        if (foreign && isMinor) required.push('natdecl');
        break;
    }
    return { required: required, optional: optional };
  }

  function currentSituation() {
    var r = form.querySelector('input[name="bb_situation"]:checked');
    return r ? r.value : '';
  }

  // Show/hide the conditional download rows + upload slots to match the current
  // situation/nationality/age, and mark shown-required uploads. Runs whenever the
  // situation, nationality, or date of birth changes.
  function currentRecentLicence() {
    var r = form.querySelector('input[name="bb_recent_licence"]:checked');
    return r ? r.value : '';
  }

  function updateBBDocs() {
    var natCode = bbNatCode();
    var minor = isMinorFromDob(val('geburtsdatum'));
    var dob = val('geburtsdatum');
    var situation = currentSituation();

    // The licence-history question only matters for a Swiss-club transfer, and
    // only when the player isn't already exempt by category.
    var recentGroup = document.getElementById('bb-recent-licence-group');
    if (recentGroup) {
      // Hidden while the waiver is off: the answer changes nothing, and the
      // question's hint promises a waiver the backend would not honour.
      var ask = FREIBRIEF_WAIVER_ENABLED && situation === 'transfer_ch' && !isYouthFreibriefExempt(dob);
      recentGroup.style.display = ask ? '' : 'none';
    }

    var set = bbDocSet(situation, natCode, minor, dob, currentRecentLicence());
    var shown = {};
    set.required.forEach(function (k) { shown[k] = 'required'; });
    set.optional.forEach(function (k) { shown[k] = 'optional'; });
    var conds = document.querySelectorAll('.bb-doc-cond');
    for (var i = 0; i < conds.length; i++) {
      var el = conds[i];
      var key = el.getAttribute('data-doc') || el.getAttribute('data-doc-upload');
      el.style.display = shown[key] ? '' : 'none';
    }
  }

  // ── Referee level toggles (VB + passive VB) ───────────────
  function setupRefToggle(checkId, groupId, selectId) {
    var check = document.getElementById(checkId);
    var group = document.getElementById(groupId);
    if (check && group) {
      check.addEventListener('change', function () {
        group.style.display = check.checked ? '' : 'none';
        if (!check.checked) {
          var sel = document.getElementById(selectId);
          if (sel) sel.selectedIndex = 0;
        }
      });
    }
  }
  setupRefToggle('vb-ref-check', 'vb-ref-level-group', 'vb-ref-level');
  setupRefToggle('passive-vb-ref-check', 'passive-vb-ref-level-group', 'passive-vb-ref-level');

  // ── Kantonsschule "which school" dropdown (VB + BB) ──────────
  // Reveal the school picker only when "other cantonal school" is chosen. The
  // picker is intentionally NOT data-conditional-required (a hidden required
  // field silently blocks submit); requiredness is validated in JS on submit.
  function setupKsOther(primaryId, groupId, otherId) {
    var primary = document.getElementById(primaryId);
    var group = document.getElementById(groupId);
    var other = document.getElementById(otherId);
    if (!primary || !group || !other) return;
    primary.addEventListener('change', function () {
      var show = primary.value === 'Andere Kantonsschule';
      group.style.display = show ? '' : 'none';
      if (!show) other.selectedIndex = 0;
    });
  }
  setupKsOther('kantonsschule-vb', 'ks-other-vb-group', 'ks-other-vb');
  setupKsOther('kantonsschule-bb', 'ks-other-bb-group', 'ks-other-bb');

  // Resolve the kantonsschule value: the specific school when "other" is picked,
  // otherwise the primary choice (Nein / KS Wiedikon).
  function kantonsschuleValue(prefix) {
    var primary = val('kantonsschule-' + prefix);
    if (primary === 'Andere Kantonsschule') return val('ks-other-' + prefix) || primary;
    return primary;
  }

  // ── Age-based AHV required logic ───────────────────────────
  // AHV mandatory if under 23 (VB) or under 25 (BB)
  var dobInput = document.getElementById('geburtsdatum');

  function isUnderAge(dobStr, maxAge) {
    if (!dobStr) return false;
    var dob = new Date(dobStr);
    var today = new Date();
    var age = today.getFullYear() - dob.getFullYear();
    var m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age < maxAge;
  }

  function updateAhvRequired() {
    var dobVal = dobInput ? dobInput.value : '';
    var selected = form.querySelector('input[name="membership_type"]:checked');
    var selType = selected ? selected.value : '';
    // Only require the AHV field of the CURRENTLY SELECTED sport. Otherwise the
    // other sport's AHV input — which sits in a display:none section — stays
    // `required` while hidden, and the browser silently refuses to submit the
    // form ("an invalid form control is not focusable"): no message, no log.
    // A guest skips the licence apparatus entirely → never require/show AHV,
    // regardless of age. (funktionVb/funktionBb are hoisted; undefined on the
    // first call before the sport is picked, which reads as "not a guest".)
    var vbGuest = funktionVb && funktionVb.value === 'Guest';
    var bbGuest = funktionBb && funktionBb.value === 'Guest';
    var vbRequired = selType === 'volleyball' && !vbGuest && isUnderAge(dobVal, 23);
    var bbRequired = selType === 'basketball' && !bbGuest && isUnderAge(dobVal, 25);
    var vbAhv = document.getElementById('vb-ahv');
    var bbAhv = document.getElementById('bb-ahv');
    var vbGroup = document.getElementById('vb-ahv-group');
    var bbGroup = document.getElementById('bb-ahv-group');
    if (vbAhv) { if (vbRequired) vbAhv.setAttribute('required', ''); else { vbAhv.removeAttribute('required'); vbAhv.value = ''; } }
    if (bbAhv) { if (bbRequired) bbAhv.setAttribute('required', ''); else { bbAhv.removeAttribute('required'); bbAhv.value = ''; } }
    if (vbGroup) vbGroup.style.display = vbRequired ? '' : 'none';
    if (bbGroup) bbGroup.style.display = bbRequired ? '' : 'none';
  }

  if (dobInput) {
    dobInput.addEventListener('change', updateAhvRequired);
    updateAhvRequired();
  }

  // ── Membership type switching ─────────────────────────────
  var typeRadios = form.querySelectorAll('input[name="membership_type"]');

  function onTypeChange() {
    var selected = form.querySelector('input[name="membership_type"]:checked');
    var type = selected ? selected.value : '';

    var passiveFields = document.getElementById('passive-fields');
    vbFields.style.display = type === 'volleyball' ? '' : 'none';
    bbFields.style.display = type === 'basketball' ? '' : 'none';
    if (passiveFields) passiveFields.style.display = type === 'passive' ? '' : 'none';

    // Toggle required attributes based on type
    toggleRequired(vbFields, type === 'volleyball');
    toggleRequired(bbFields, type === 'basketball');
    if (passiveFields) toggleRequired(passiveFields, type === 'passive');

    // AHV required only if under 25 (override the conditional-required)
    updateAhvRequired();

    // Reset funktion dropdowns and hide team wrappers when switching type
    if (funktionVb) { funktionVb.selectedIndex = 0; }
    if (funktionBb) { funktionBb.selectedIndex = 0; }
    var vbTeamW = document.getElementById('vb-team-wrapper');
    var bbTeamW = document.getElementById('bb-team-wrapper');
    if (vbTeamW) vbTeamW.style.display = 'none';
    if (bbTeamW) bbTeamW.style.display = 'none';

    // Funktion is reset to blank above (not a guest) — restore any player-only
    // fields that a previous guest selection hid on the now-selected sport.
    if (type === 'volleyball') applyGuestVisibility('volleyball', false);
    else if (type === 'basketball') applyGuestVisibility('basketball', false);
  }

  function toggleRequired(container, isRequired) {
    var inputs = container.querySelectorAll('[data-conditional-required]');
    for (var i = 0; i < inputs.length; i++) {
      if (isRequired) {
        inputs[i].setAttribute('required', '');
      } else {
        inputs[i].removeAttribute('required');
      }
    }
  }

  typeRadios.forEach(function (r) { r.addEventListener('change', onTypeChange); });

  // ── Name charset guard (soft) ─────────────────────────────
  // The club's membership system (ClubDesk) imports contacts via CP1252 CSV,
  // which can't hold Eastern-European/Slavic Latin (ć ł đ ń ž …) or non-Latin
  // scripts — such names get simplified there (ć→c). We keep the correct name
  // in wiedisync and just warn the person; submission is never blocked.
  // CP1252 = ASCII + Latin-1 (≤ U+00FF) + a handful of extras below.
  var CP1252_EXTRA = {
    338: 1, 339: 1, 352: 1, 353: 1, 376: 1, 381: 1, 382: 1, 402: 1, 710: 1, 732: 1,
    8211: 1, 8212: 1, 8216: 1, 8217: 1, 8218: 1, 8220: 1, 8221: 1, 8222: 1, 8224: 1,
    8225: 1, 8226: 1, 8230: 1, 8240: 1, 8249: 1, 8250: 1, 8364: 1, 8482: 1
  };
  function nameHasUnsupportedChar(str) {
    for (var i = 0; i < str.length; i++) {
      var cp = str.codePointAt(i);
      if (cp > 0xFF && !CP1252_EXTRA[cp]) return true;
      if (cp > 0xFFFF) i++; // surrogate pair
    }
    return false;
  }
  ['vorname', 'nachname'].forEach(function (id) {
    var input = document.getElementById(id);
    var warn = document.querySelector('.name-charset-warn[data-for="' + id + '"]');
    if (!input || !warn) return;
    input.addEventListener('input', function () {
      warn.style.display = nameHasUnsupportedChar(input.value) ? 'block' : 'none';
    });
  });

  // ── Turnstile ─────────────────────────────────────────────
  var turnstileWidgetId = null;
  var turnstileContainer = document.getElementById('turnstile-container');

  function renderTurnstile() {
    if (!turnstileContainer || !window.turnstile) return;
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      size: 'flexible',
      // Resilience: auto-refresh an expired token and auto-retry transient
      // challenge failures (the 300xxx client-side errors some mobile browsers /
      // privacy blockers throw) instead of dead-ending the applicant.
      'refresh-expired': 'auto',
      retry: 'auto',
      'retry-interval': 3000,
      'expired-callback': function () {
        // Token went stale (valid only ~5 min; this form takes longer to fill).
        // Reset so a fresh token is fetched and the submit handler doesn't
        // silently bounce the user with an empty token. Not logged: this is an
        // expected background refresh, not a block — a real submit-time expiry is
        // caught and logged at the getResponse() check below.
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) { /* noop */ }
      },
      'timeout-callback': function () {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) { /* noop */ }
      },
      'error-callback': function (code) {
        // Returning true tells Turnstile we've handled it, suppressing the
        // "Uncaught TurnstileError" and letting retry:'auto' recover.
        logBlock('turnstile error ' + (code || ''));
        return true;
      },
    });
  }

  if (window.turnstile) {
    renderTurnstile();
  } else {
    var pollCount = 0;
    var pollInterval = setInterval(function () {
      pollCount++;
      if (window.turnstile) { clearInterval(pollInterval); renderTurnstile(); }
      if (pollCount > 50) clearInterval(pollInterval);
    }, 100);
  }

  // ── Funktion dropdown logic ────────────────────────────────
  var funktionVb = document.getElementById('funktion-vb');
  var funktionBb = document.getElementById('funktion-bb');

  // Gender-based team name patterns
  // VB: D = Damen, H = Herren, DU = Damen youth, HU = Herren youth
  // BB: DU/D/Lions/Rhinos/Damen = women, HU/MU/H/Herren/H-Classics = men
  function getTeamGender(teamName, sport) {
    var n = teamName.toLowerCase();
    if (sport === 'volleyball') {
      if (/^d[u\d]/.test(n)) return 'weiblich';
      if (/^h[u\d]/.test(n)) return 'männlich';
      if (n === 'minivb') return 'mixed';
      if (n === 'legends') return 'männlich';
      return 'mixed';
    }
    // basketball
    if (/^du\d|^lions|^rhinos|^damen/.test(n)) return 'weiblich';
    if (/^hu\d|^herren|^h-classics/.test(n)) return 'männlich';
    // "MU…" = Mixed-U (co-ed minis), not male — falls through to mixed.
    return 'mixed';
  }

  // Player-only fields a guest never fills: licence toggles, cantonal school and
  // (for BB) the ID / licence-document uploads + situation. They carry the
  // `.js-guest-hide` class in the form. Hide them and strip `required` for a
  // guest so a hidden required control can't silently block submit; restore for a
  // player. AHV visibility is owned by updateAhvRequired (guest-guarded there).
  function applyGuestVisibility(sport, isGuest) {
    var fieldset = sport === 'volleyball' ? vbFields : bbFields;
    if (!fieldset) return;
    var groups = fieldset.querySelectorAll('.js-guest-hide');
    for (var i = 0; i < groups.length; i++) {
      groups[i].style.display = isGuest ? 'none' : '';
      var reqs = groups[i].querySelectorAll('[data-conditional-required]');
      for (var j = 0; j < reqs.length; j++) {
        if (isGuest) reqs[j].removeAttribute('required');
        else reqs[j].setAttribute('required', '');
      }
    }
    // Conditional sub-groups (cantonal-school "other", VB referee level) have
    // their own show-on-trigger handlers; force them closed for a guest so a
    // previously-opened one can't linger visible/required after the switch.
    if (isGuest) {
      [sport === 'volleyball' ? 'ks-other-vb-group' : 'ks-other-bb-group',
       sport === 'volleyball' ? 'vb-ref-level-group' : null].forEach(function (id) {
        if (!id) return;
        var el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
        el.querySelectorAll('[required]').forEach(function (r) { r.removeAttribute('required'); });
      });
    }
  }

  function onFunktionChange(sport) {
    var funktionEl = sport === 'volleyball' ? funktionVb : funktionBb;
    var teamWrapper = document.getElementById(sport === 'volleyball' ? 'vb-team-wrapper' : 'bb-team-wrapper');
    if (!funktionEl || !teamWrapper) return;

    var funktion = funktionEl.value;
    var isGuest = funktion === 'Guest';
    applyGuestVisibility(sport, isGuest);
    // AHV requiredness now depends on funktion (guest → never) — recompute.
    updateAhvRequired();

    // A guest picks a team like a player, just at a reduced fee (no licence).
    var showTeam = isGuest || funktion === 'Spieler*in' || funktion === 'Trainer*in' || funktion === 'Teamverantwortliche*r';
    teamWrapper.style.display = showTeam ? '' : 'none';

    if (showTeam) {
      fetchTeams(sport);
    }
  }

  if (funktionVb) funktionVb.addEventListener('change', function () { onFunktionChange('volleyball'); });
  if (funktionBb) funktionBb.addEventListener('change', function () { onFunktionChange('basketball'); });

  // Re-filter teams when gender changes
  if (geschlechtSelect) {
    geschlechtSelect.addEventListener('change', function () {
      var type = (form.querySelector('input[name="membership_type"]:checked') || {}).value;
      if (type === 'volleyball' || type === 'basketball') {
        fetchTeams(type);
      }
    });
  }

  // ── Team fetching ─────────────────────────────────────────
  var teamCache = {};   // sport -> teams[] once loaded
  var teamLoad = {};    // sport -> in-flight promise, so we never fire twice

  // Network fetch + cache. Shared by the page-load prefetch and the on-demand
  // fetchTeams(). Rejects on network/HTTP failure and leaves the cache unset,
  // so callers can retry. In-flight requests are deduped: a prefetch still in
  // flight when the applicant reaches the team step is reused, not refired.
  function loadTeams(sport) {
    if (teamCache[sport]) return Promise.resolve(teamCache[sport]);
    if (teamLoad[sport]) return teamLoad[sport];
    teamLoad[sport] = fetch(DIRECTUS_URL + '/items/teams?filter[sport][_eq]=' + sport +
      '&filter[active][_eq]=true&fields=id,name,league&sort=name&limit=-1')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        teamCache[sport] = (data && data.data) ? data.data : [];
        teamLoad[sport] = null;
        return teamCache[sport];
      })
      .catch(function (err) {
        teamLoad[sport] = null;   // uncached → next call retries
        throw err;
      });
    return teamLoad[sport];
  }

  function fetchTeams(sport) {
    var containerId = sport === 'volleyball' ? 'vb-team' : 'bb-team';
    var container = document.getElementById(containerId);
    if (!container) return;

    loadTeams(sport)
      .then(function (teams) { populateTeams(container, teams); })
      .catch(function (err) {
        // Flaky mobile connections hit this. The cache stays unset, so the retry
        // button (or a later funktion/gender change) re-fetches. Surface a visible
        // error + retry instead of leaving an empty list that dead-ends the
        // applicant at "no team selected" with no explanation. Also log it: this
        // failure used to be swallowed silently and was invisible in the logs.
        logBlock('teams fetch failed (' + sport + '): ' + (err && err.message ? err.message : 'unknown'));
        showTeamsError(container, sport);
      });
  }

  // Warm the team cache at page load, so the list is ready by the time the
  // applicant reaches the team step — the fetch happens up front (usually on a
  // better connection, with time to recover) instead of lazily mid-form on a
  // flaky link. Failures stay uncached; the on-demand fetchTeams() then retries
  // and surfaces the error/retry UI at the team step.
  ['volleyball', 'basketball'].forEach(function (sp) {
    loadTeams(sp).catch(function () { /* handled on-demand at the team step */ });
  });

  // Inline "couldn't load teams" state with a retry, shown inside the team
  // dropdown when fetchTeams() fails.
  function showTeamsError(container, sport) {
    container.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'padding: 0.75rem 1rem; color: var(--text-secondary); font-size: var(--text-sm);';
    var msg = document.createElement('div');
    msg.textContent = locale === 'de'
      ? 'Teams konnten nicht geladen werden (Netzwerkfehler). Bitte erneut versuchen.'
      : 'Could not load the team list (network error). Please try again.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = locale === 'de' ? 'Erneut versuchen' : 'Try again';
    btn.style.cssText = 'margin-top: 0.5rem; padding: 0.4rem 0.9rem; cursor: pointer;';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      container.innerHTML = '';
      fetchTeams(sport);
    });
    box.appendChild(msg);
    box.appendChild(btn);
    container.appendChild(box);
  }

  function populateTeams(container, teams) {
    container.innerHTML = '';
    var sport = container.id === 'vb-team' ? 'vb' : 'bb';
    var sportFull = sport === 'vb' ? 'volleyball' : 'basketball';
    var triggerText = document.getElementById(sport + '-team-trigger-text');
    var funktionEl = sport === 'vb' ? funktionVb : funktionBb;
    var funktion = funktionEl ? funktionEl.value : '';
    var isPlayer = funktion === 'Spieler*in';
    var gender = geschlechtSelect ? geschlechtSelect.value : '';

    function updateTriggerText() {
      var checked = container.querySelectorAll('input[name="team_' + sport + '"]:checked');
      var names = [];
      for (var k = 0; k < checked.length; k++) names.push(checked[k].value);
      if (triggerText) {
        triggerText.textContent = names.length ? names.join(', ') : (locale === 'de' ? 'Team wählen…' : 'Select team…');
      }
    }

    // Filter teams: players only see their gender's teams, coach/TR see all
    var filtered = [];
    for (var fi = 0; fi < teams.length; fi++) {
      if (isPlayer && gender) {
        var tg = getTeamGender(teams[fi].name, sportFull);
        // Youth "Mix" leagues (e.g. HU12 → MixU12M) are co-ed; the name-based
        // heuristic mis-tags them by sex, hiding them from the other sex. Trust
        // the league label when it says Mixed.
        if (/mix/i.test(teams[fi].league || '')) tg = 'mixed';
        if (tg !== 'mixed' && tg !== gender) continue;
      }
      filtered.push(teams[fi]);
    }

    // Show hint if player but no gender selected
    if (isPlayer && !gender) {
      var hint = document.createElement('div');
      hint.style.cssText = 'padding: 0.75rem 1rem; color: var(--text-secondary); font-size: var(--text-sm);';
      hint.textContent = locale === 'de'
        ? 'Bitte wähle zuerst dein Geschlecht, damit die passenden Teams angezeigt werden.'
        : 'Please select your sex first so the matching teams are shown.';
      container.appendChild(hint);
      return;
    }

    for (var i = 0; i < filtered.length; i++) {
      (function (team) {
        var div = document.createElement('div');
        div.className = 'team-opt';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'team_' + sport;
        cb.value = team.name;
        cb.style.cssText = 'pointer-events: none;';
        var span = document.createElement('span');
        span.textContent = team.name + (team.league ? ' — ' + team.league : '');
        div.appendChild(cb);
        div.appendChild(span);
        div.addEventListener('click', function (e) {
          e.stopPropagation();
          cb.checked = !cb.checked;
          div.className = 'team-opt' + (cb.checked ? ' selected' : '');
          updateTriggerText();
        });
        container.appendChild(div);
      })(filtered[i]);
    }
  }

  // ── Team dropdown toggle ──────────────────────────────────
  function setupTeamDropdown(sport) {
    var wrapper = document.getElementById(sport + '-team-wrapper');
    var trigger = document.getElementById(sport + '-team-trigger');
    if (!wrapper || !trigger) return;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      // Close other team dropdowns
      var others = document.querySelectorAll('.team-wrapper.open');
      for (var i = 0; i < others.length; i++) {
        if (others[i] !== wrapper) others[i].classList.remove('open');
      }
      // Also close the nationality + federation dropdowns
      if (natWrapper && natWrapper !== wrapper) natWrapper.classList.remove('open');
      if (fedWrapper && fedWrapper !== wrapper) fedWrapper.classList.remove('open');
      wrapper.classList.toggle('open');
    });
  }
  setupTeamDropdown('vb');
  setupTeamDropdown('bb');

  // Close team dropdowns on outside click
  document.addEventListener('click', function () {
    var openTeams = document.querySelectorAll('.team-wrapper.open');
    for (var i = 0; i < openTeams.length; i++) openTeams[i].classList.remove('open');
  });

  // ── Feedback helpers ──────────────────────────────────────
  function showFeedback(type, msg) {
    if (type === 'success') {
      showSuccessModal(msg);
      return;
    }
    if (!feedback) return;
    feedback.className = 'form-feedback form-feedback--' + type;
    feedback.textContent = msg;
    feedback.style.display = '';
  }

  function showSuccessModal(msg) {
    var overlay = document.createElement('div');
    overlay.className = 'success-modal-overlay';
    var modal = document.createElement('div');
    modal.className = 'success-modal';

    // WEB-SEC-7: build the dynamic message via textContent so it can never be
    // interpreted as HTML regardless of source. The static icon/button stay as
    // markup; only the message node carries (currently static i18n) text.
    var iconWrap = document.createElement('div');
    iconWrap.className = 'success-modal-icon';
    iconWrap.innerHTML =
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';

    var msgEl = document.createElement('p');
    msgEl.className = 'success-modal-msg';
    msgEl.textContent = msg || '';

    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'success-modal-btn';
    okBtn.textContent = 'OK';

    modal.appendChild(iconWrap);
    modal.appendChild(msgEl);
    modal.appendChild(okBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    // Trigger animation
    requestAnimationFrame(function () { overlay.classList.add('visible'); });
    var btn = modal.querySelector('.success-modal-btn');
    btn.addEventListener('click', function () {
      overlay.classList.remove('visible');
      setTimeout(function () { overlay.remove(); }, 200);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
        setTimeout(function () { overlay.remove(); }, 200);
      }
    });
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.style.display = 'none';
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (loading) {
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = i18n.t('registrationSending');
    } else {
      submitBtn.textContent = submitBtn.dataset.originalText || i18n.t('registrationSubmit');
    }
  }

  // ── Contact-data validators ────────────────────────────────
  // Client-side mirror of the server-side normalizers in
  // POST /kscw/registration: same rules, instant localized feedback,
  // and canonical values on the wire.

  // IBAN: strip spaces/dots/apostrophes/hyphens, uppercase.
  function normalizeIbanCompact(raw) {
    return String(raw || '').replace(/[\s.'-]/g, '').toUpperCase();
  }

  // ISO 13616 structure + mod-97 checksum.
  function isValidIban(raw) {
    var iban = normalizeIbanCompact(raw);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    var rearranged = iban.slice(4) + iban.slice(0, 4);
    var remainder = 0;
    for (var i = 0; i < rearranged.length; i++) {
      var ch = rearranged[i];
      var chDigits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
      for (var j = 0; j < chDigits.length; j++) remainder = (remainder * 10 + Number(chDigits[j])) % 97;
    }
    return remainder === 1;
  }

  // AHV: 756 + 10 digits with an EAN-13 check digit (digit[i] × 1/3
  // alternating, sum ≡ 0 mod 10). Returns the canonical dotted form
  // (756.XXXX.XXXX.XX) or '' when the number can't be valid. Excel-style
  // scientific notation (e.g. 7.5612E+12) has lost digits — always rejected.
  function ahvCanonical(raw) {
    var s = String(raw || '');
    if (/[eE]\d/.test(s)) return '';
    var digits = s.replace(/\D/g, '');
    if (!/^756\d{10}$/.test(digits)) return '';
    var sum = 0;
    for (var i = 0; i < 13; i++) sum += Number(digits.charAt(i)) * (i % 2 === 0 ? 1 : 3);
    if (sum % 10 !== 0) return '';
    return digits.slice(0, 3) + '.' + digits.slice(3, 7) + '.' + digits.slice(7, 11) + '.' + digits.slice(11);
  }

  // Phone: decorations (apostrophes, /, ., -, brackets) become spaces, then
  // all whitespace is removed; one leading 0 (national style "079 123 45 67")
  // is dropped before the dial code. CH numbers must be exactly 9 digits and
  // are sent grouped ("+41 79 123 45 67"); other countries are sent compact
  // ("+436501234567", 4–14 digits). Returns '' when the number can't be valid.
  function canonicalPhone(rawTyped, dial) {
    var cleaned = String(rawTyped || '').replace(/['’\/().-]/g, ' ').replace(/\s+/g, '');
    if (!/^\d+$/.test(cleaned)) return '';
    var national = cleaned.charAt(0) === '0' ? cleaned.slice(1) : cleaned;
    if (dial === '+41') {
      if (national.length !== 9) return '';
      return '+41 ' + national.slice(0, 2) + ' ' + national.slice(2, 5) + ' ' +
        national.slice(5, 7) + ' ' + national.slice(7);
    }
    if (national.length < 4 || national.length > 14) return '';
    return '+' + String(dial || '').replace(/\D/g, '') + national;
  }

  // ── Form submission ───────────────────────────────────────
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideFeedback();

    var type = (form.querySelector('input[name="membership_type"]:checked') || {}).value;
    if (!type) { logBlock('blocked: no membership type'); return showFeedback('error', i18n.t('registrationValidationRequired')); }

    var consent = document.getElementById('consent');
    if (!consent || !consent.checked) { logBlock('blocked: consent not checked'); return showFeedback('error', i18n.t('registrationValidationConsent')); }

    var turnstileToken = '';
    if (window.turnstile && turnstileWidgetId !== null) {
      turnstileToken = window.turnstile.getResponse(turnstileWidgetId) || '';
    }
    if (!turnstileToken) {
      // Most common cause: the token expired while the (long) form was filled,
      // so getResponse() is empty even though the widget may still look solved.
      // Reset to fetch a fresh token and tell the user to re-confirm.
      logBlock('blocked: missing/expired turnstile token at submit');
      if (window.turnstile && turnstileWidgetId !== null) {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) { /* noop */ }
      }
      return showFeedback('error', i18n.t('registrationValidationCaptcha'));
    }

    // A guest trains with the team but isn't licensed to play → skip the whole
    // basketball licence/ID/document gate (mirrors the server-side isGuest guard).
    var isGuest = (type === 'volleyball' && val('funktion-vb') === 'Guest')
      || (type === 'basketball' && val('funktion-bb') === 'Guest');
    if (type === 'basketball' && !isGuest) {
      var front = document.getElementById('id-front');
      if (!front.files.length) {
        logBlock('blocked: bb ID front missing');
        return showFeedback('error', i18n.t('registrationValidationID'));
      }
      var back = document.getElementById('id-back');
      if (back && !back.files.length) {
        logBlock('blocked: bb ID back missing');
        return showFeedback('error', locale === 'de'
          ? 'Bitte lade auch die Rückseite deiner ID / deines Passes hoch.'
          : 'Please also upload the back of your ID / passport.');
      }
      var lizenzUpload = document.getElementById('bb-doc-lizenz-upload');
      if (lizenzUpload && !lizenzUpload.files.length) {
        logBlock('blocked: bb lizenzantrag upload missing');
        return showFeedback('error', locale === 'de'
          ? 'Bitte lade den unterschriebenen Lizenzantrag hoch.'
          : 'Please upload the signed licence application.');
      }
      var natCode = bbNatCode();
      if (!natCode) {
        logBlock('blocked: bb nationality not selected');
        return showFeedback('error', locale === 'de'
          ? 'Bitte wähle deine Nationalität.'
          : 'Please select your nationality.');
      }
      // Situation (new / Swiss-club transfer / from abroad / returner) selects the
      // required document set per Swiss Basketball's licensing procedure.
      var situation = currentSituation();
      if (BB_SITUATIONS.indexOf(situation) === -1) {
        logBlock('blocked: bb situation not selected');
        return showFeedback('error', locale === 'de'
          ? 'Bitte wähle deine Situation aus (neue Lizenz, Vereinswechsel …).'
          : 'Please choose your situation (new licence, club transfer …).');
      }
      // Each situation-specific document that is REQUIRED must be uploaded. Without
      // this, an applicant could submit missing e.g. the Freibrief for a Swiss-club
      // transfer and it would go through silently.
      // A Swiss-club transfer must say whether a licence was held recently — the
      // answer decides whether the Freibrief is required at all.
      var dobVal = val('geburtsdatum');
      var recent = currentRecentLicence();
      if (FREIBRIEF_WAIVER_ENABLED && situation === 'transfer_ch' && !isYouthFreibriefExempt(dobVal) && !recent) {
        logBlock('blocked: bb recent-licence question unanswered');
        return showFeedback('error', locale === 'de'
          ? 'Bitte gib an, ob du in den letzten zwei Saisons eine Swiss-Basketball-Lizenz hattest.'
          : 'Please tell us whether you held a Swiss Basketball licence in the last two seasons.');
      }
      var reqDocs = bbDocSet(situation, natCode, isMinorFromDob(dobVal), dobVal, recent).required;
      var DOC_UPLOAD_IDS = {
        freibrief: 'bb-doc-freibrief-upload',
        selfdecl: 'bb-doc-selfdecl-upload',
        natdecl: 'bb-doc-natdecl-upload',
        u18parents: 'bb-doc-u18parents-upload',
      };
      var DOC_MISSING_MSG = {
        freibrief: locale === 'de'
          ? 'Bei einem Vereinswechsel innerhalb der Schweiz musst du den vom bisherigen Club unterschriebenen Freibrief hochladen.'
          : 'For a transfer from another Swiss club you must upload the release letter (Freibrief) signed by your previous club.',
        selfdecl: locale === 'de'
          ? 'Für deine Situation musst du zusätzlich die unterschriebene «Player’s Self Declaration» hochladen.'
          : 'For your situation you must also upload the signed "Player’s Self Declaration".',
        natdecl: locale === 'de'
          ? 'Für Spieler:innen unter 18 musst du zusätzlich das unterschriebene «Acknowledgment of National Team Restriction» hochladen.'
          : 'For players under 18 you must also upload the signed "Acknowledgment of National Team Restriction".',
        u18parents: locale === 'de'
          ? 'Für Spieler:innen unter 18 musst du zusätzlich das unterschriebene Einverständnis der Eltern (U18) hochladen.'
          : 'For players under 18 you must also upload the signed parental consent (U18).',
      };
      for (var ri = 0; ri < reqDocs.length; ri++) {
        var dk = reqDocs[ri];
        var upEl = document.getElementById(DOC_UPLOAD_IDS[dk]);
        if (upEl && !upEl.files.length) {
          logBlock('blocked: bb doc missing (' + dk + ', situation=' + situation + ')');
          return showFeedback('error', DOC_MISSING_MSG[dk]);
        }
      }
    }

    // Validate at least one team selected (VB or BB) — unless funktion is "Andere"
    if (type === 'volleyball' || type === 'basketball') {
      var funktionVal = type === 'volleyball' ? val('funktion-vb') : val('funktion-bb');
      if (funktionVal !== 'Andere') {
        var teamName = type === 'volleyball' ? 'team_vb' : 'team_bb';
        var checked = form.querySelectorAll('input[name="' + teamName + '"]:checked');
        if (!checked.length) {
          logBlock('blocked: no team selected (' + type + ')');
          return showFeedback('error', i18n.t('registrationValidationTeam'));
        }
      }
    }

    // "Other cantonal school" picked but no specific school chosen.
    if (type === 'volleyball' || type === 'basketball') {
      var ksPrefix = type === 'volleyball' ? 'vb' : 'bb';
      if (val('kantonsschule-' + ksPrefix) === 'Andere Kantonsschule' && !val('ks-other-' + ksPrefix)) {
        logBlock('blocked: kantonsschule (other) not specified');
        return showFeedback('error', locale === 'de'
          ? 'Bitte wähle deine Kantonsschule.'
          : 'Please select your cantonal school.');
      }
    }

    // Build full phone number: "+41 79 123 45 67" format (canonical, mirrors
    // the backend guard). Empty is left to the browser's `required` check.
    var phoneCode = document.getElementById('phone-country');
    var phoneNum = val('telefon');
    var dialCode = '';
    if (phoneCode) {
      var selOpt = phoneCode.options[phoneCode.selectedIndex];
      dialCode = selOpt ? selOpt.dataset.dial : '';
    }
    var fullPhone = dialCode ? (dialCode + ' ' + phoneNum) : phoneNum;
    if (phoneNum) {
      fullPhone = canonicalPhone(phoneNum, dialCode);
      if (!fullPhone) {
        logBlock('blocked: invalid phone number');
        return showFeedback('error', locale === 'de'
          ? 'Bitte überprüfe die Telefonnummer — sie scheint ungültig zu sein.'
          : 'Please check the phone number — it does not look like a valid number.');
      }
    }

    // AHV (when given): 756-prefixed 13 digits + EAN-13 check digit; the
    // canonical dotted form (756.XXXX.XXXX.XX) is what gets sent.
    var ahvCanon = '';
    if (type === 'volleyball' || type === 'basketball') {
      var ahvRaw = val(type === 'volleyball' ? 'vb-ahv' : 'bb-ahv');
      if (ahvRaw) {
        ahvCanon = ahvCanonical(ahvRaw);
        if (!ahvCanon) {
          logBlock('blocked: invalid AHV number');
          return showFeedback('error', locale === 'de'
            ? 'Bitte überprüfe die AHV-Nummer (Format 756.XXXX.XXXX.XX) — die Prüfziffer stimmt nicht.'
            : 'Please check the AHV number (format 756.XXXX.XXXX.XX) — the check digit does not match.');
        }
      }
    }

    // IBAN (required): normalized compact form, ISO 13616 mod-97 checked.
    var ibanCompact = normalizeIbanCompact(val('iban'));
    if (!ibanCompact) {
      logBlock('blocked: IBAN missing');
      return showFeedback('error', locale === 'de'
        ? 'Bitte gib deine IBAN an.'
        : 'Please enter your IBAN.');
    }
    if (!isValidIban(ibanCompact)) {
      logBlock('blocked: invalid IBAN');
      return showFeedback('error', locale === 'de'
        ? 'Bitte überprüfe die IBAN — sie ist keine gültige Kontonummer.'
        : 'Please check the IBAN — it is not a valid account number.');
    }

    setLoading(true);

    // Build JSON payload
    var payload = {
      membership_type: type,
      vorname: val('vorname'),
      nachname: val('nachname'),
      email: val('email'),
      telefon_mobil: fullPhone,
      adresse: val('adresse'),
      plz: val('plz'),
      ort: val('ort'),
      geburtsdatum: val('geburtsdatum'),
      // Display names (human-readable, in the submitter's language) plus the
      // canonical codes. `nationalitaet_code` stays the PRIMARY code so the
      // server-side basketball document gate keeps its existing contract.
      nationalitaet: natHidden ? natHidden.value : '',
      nationalitaet_code: natCodes[0] || '',
      nationalitaet_codes: natCodes.join(','),
      federation_of_origin: fedHidden ? fedHidden.value : '',
      geschlecht: val('geschlecht'),
      bemerkungen: val('bemerkungen'),
      turnstile_token: turnstileToken,
      locale: locale,
    };

    // IBAN (required) — validated non-empty above, always sent.
    payload.iban = ibanCompact;

    if (type === 'volleyball') {
      payload.anrede = anredeHidden ? anredeHidden.value : '';
      payload.rolle = val('funktion-vb');
      var vbTeams = [];
      form.querySelectorAll('input[name="team_vb"]:checked').forEach(function (cb) { vbTeams.push(cb.value); });
      payload.team = vbTeams.join(', ');
      payload.beitragskategorie = val('vb-fee');
      payload.ahv_nummer = ahvCanon;
      payload.kantonsschule = kantonsschuleValue('vb');
      var lizenzVbChecked = [];
      form.querySelectorAll('input[name="lizenz_vb"]:checked').forEach(function (cb) {
        lizenzVbChecked.push(cb.value);
      });
      if (lizenzVbChecked.length) {
        payload.lizenz = lizenzVbChecked.join(', ');
      }
      var refLevel = val('vb-ref-level');
      if (refLevel) payload.schiedsrichter_stufe = refLevel;
    }

    if (type === 'basketball') {
      payload.anrede = anredeHidden ? anredeHidden.value : '';
      payload.rolle = val('funktion-bb');
      var bbTeams = [];
      form.querySelectorAll('input[name="team_bb"]:checked').forEach(function (cb) { bbTeams.push(cb.value); });
      payload.team = bbTeams.join(', ');
      payload.beitragskategorie = val('bb-fee');
      payload.ahv_nummer = ahvCanon;
      payload.kantonsschule = kantonsschuleValue('bb');
      // BB licence: scorer (radio, single choice) + referee (checkbox, combinable)
      var bbLicParts = [];
      var scorerRadio = form.querySelector('input[name="bb_scorer_licence"]:checked');
      if (scorerRadio && scorerRadio.value) bbLicParts.push(scorerRadio.value);
      var refCheck = document.getElementById('bb-ref-check');
      if (refCheck && refCheck.checked) bbLicParts.push('Schiedsrichter');
      payload.lizenz = bbLicParts.join(', ') || '';
      // Licensing situation drives which Swiss Basketball documents are required
      // (server re-validates using this + nationality + date of birth).
      payload.bb_situation = currentSituation();
      // Only meaningful for a Swiss-club transfer; recorded so the club can see
      // why a Freibrief is absent from an otherwise complete dossier.
      if (currentSituation() === 'transfer_ch') payload.bb_recent_licence = currentRecentLicence();
    }

    if (type === 'passive') {
      payload.anrede = anredeHidden ? anredeHidden.value : '';
      // Fee category: "Passivmitglied" (paying) or "Gratis" (referees/officials).
      // Fallback covers cached pages that predate the #passive-fee select.
      payload.beitragskategorie = val('passive-fee') || 'Passivmitglied';
      var lizenzPassive = [];
      form.querySelectorAll('input[name="lizenz_passive"]:checked').forEach(function (cb) {
        lizenzPassive.push(cb.value);
      });
      var passiveBBScorer = form.querySelector('input[name="passive_bb_scorer"]:checked');
      if (passiveBBScorer && passiveBBScorer.value) lizenzPassive.push(passiveBBScorer.value);
      if (lizenzPassive.length) {
        payload.lizenz = lizenzPassive.join(', ');
        payload.rolle = lizenzPassive.join(', ');
      }
      var passiveRefLevel = val('passive-vb-ref-level');
      if (passiveRefLevel) payload.schiedsrichter_stufe = passiveRefLevel;
    }

    // Documents FIRST, registration second: the server refuses a basketball
    // registration whose document ids are missing (docs_required), so wait for
    // the eager uploads (started on file pick) and put their ids into the
    // create payload. No more create-then-upload window — a failed upload
    // means NO registration is created and the user can simply retry.
    var docsReady = Promise.resolve();
    if (type === 'basketball') {
      docsReady = collectDocIds().then(function (docIds) {
        for (var dk in docIds) payload[dk] = docIds[dk];
      });
    }

    docsReady
      .then(function () {
        return fetch(DIRECTUS_URL + '/kscw/registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || d.error || i18n.t('registrationError')); });
        return r.json();
      })
      .then(function (data) {
        // Belt-and-braces vs deploy-order skew: ALSO link the documents via the
        // attach route. An old backend (ignores doc ids at create) applies them
        // here; the new backend idempotently re-sets the same ids. Non-fatal —
        // logged if it ever fails so it shows up in the error log.
        if (type === 'basketball' && data && data.id) {
          // Email is now a required second factor on the attach route (backend
          // audit #8, 2026-07-05); send it. Backward-compatible — an older backend
          // that doesn't require it simply ignores the extra field.
          var linkBody = { reference_number: data.reference_number, email: payload.email };
          var haveDocs = false;
          for (var lk in docUploads) {
            if (docUploads[lk] && docUploads[lk].fileId) { linkBody[lk] = docUploads[lk].fileId; haveDocs = true; }
          }
          if (haveDocs) {
            return fetch(DIRECTUS_URL + '/kscw/registration/' + data.id + '/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(linkBody),
            }).then(function (lr) {
              if (!lr.ok) logBlock('doc link fallback failed: HTTP ' + lr.status);
            }).catch(function (le) {
              logBlock('doc link fallback failed: ' + (le && le.message ? le.message : 'unknown'));
            });
          }
        }
      })
      .then(function () {
        showFeedback('success', i18n.t('registrationSuccess'));
        form.reset();
        // Reset custom UI
        docUploads = {};
        var stEls = form.querySelectorAll('.doc-upload-status');
        for (var si = 0; si < stEls.length; si++) stEls[si].textContent = '';
        natCodes = [];
        syncNationality();
        if (fedHidden) fedHidden.value = '';
        if (fedTriggerText) fedTriggerText.textContent = '—';
        // form.reset() cleared the situation radios and nationality; collapse all
        // conditional document rows back to hidden until they're re-selected.
        var fdRows = document.querySelectorAll('.bb-doc-cond');
        for (var fdi = 0; fdi < fdRows.length; fdi++) fdRows[fdi].style.display = 'none';
        if (phoneCode) phoneCode.value = 'CH';
        vbFields.style.display = 'none';
        bbFields.style.display = 'none';
        var pf = document.getElementById('passive-fields');
        if (pf) pf.style.display = 'none';
        var vbTw = document.getElementById('vb-team-wrapper');
        var bbTw = document.getElementById('bb-team-wrapper');
        if (vbTw) vbTw.style.display = 'none';
        if (bbTw) bbTw.style.display = 'none';
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      })
      .catch(function (err) {
        // Backend/network fetch failures are already logged by error-logger.js;
        // this also captures pure client-side throws (e.g. file too large /
        // wrong type from validateFile) that never hit the network.
        logBlock('submit failed: ' + (err && err.message ? err.message : 'unknown'));
        showFeedback('error', err.message || i18n.t('registrationError'));
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      })
      .finally(function () {
        setLoading(false);
      });
  });

  // ── File validation + upload (basketball) ──────────────────
  var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  function validateFile(file) {
    if (ALLOWED_TYPES.indexOf(file.type) === -1) {
      throw new Error(locale === 'de'
        ? 'Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, PDF.'
        : 'Invalid file type. Allowed: JPG, PNG, WebP, PDF.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(locale === 'de'
        ? 'Datei zu gross (max. 10 MB).'
        : 'File too large (max 10 MB).');
    }
  }

  // ── Eager document upload ───────────────────────────────────
  // Each document uploads to /files the moment it is picked, with inline
  // status feedback next to the input. A failed upload (wrong type, too
  // large, network/Safari blob errors) is visible IMMEDIATELY — before
  // submit — and re-picking the file retries. At submit, collectDocIds()
  // waits for in-flight uploads and hands the file ids to the create call.
  var DOC_INPUTS = [
    { id: 'id-front', key: 'id_upload_front' },
    { id: 'id-back', key: 'id_upload_back' },
    { id: 'bb-doc-lizenz-upload', key: 'bb_doc_lizenz' },
    { id: 'bb-doc-freibrief-upload', key: 'bb_doc_freibrief' },
    { id: 'bb-doc-selfdecl-upload', key: 'bb_doc_selfdecl' },
    { id: 'bb-doc-natdecl-upload', key: 'bb_doc_natdecl' },
    { id: 'bb-doc-u18parents-upload', key: 'bb_doc_u18parents' },
    { id: 'bb-doc-schoolcert-upload', key: 'bb_doc_schoolcert' },
  ];
  var docUploads = {}; // key → { promise, fileId, error }

  function docStatusEl(input) {
    var el = input.nextElementSibling;
    if (el && el.className === 'doc-upload-status') return el;
    el = document.createElement('small');
    el.className = 'doc-upload-status';
    el.style.display = 'block';
    el.style.marginTop = '4px';
    input.parentNode.insertBefore(el, input.nextSibling);
    return el;
  }

  function startDocUpload(input, key) {
    var file = input.files[0];
    var st = docStatusEl(input);
    if (!file) {
      delete docUploads[key];
      st.textContent = '';
      return;
    }
    try {
      validateFile(file);
    } catch (e) {
      input.value = '';
      delete docUploads[key];
      st.textContent = '✗ ' + e.message;
      st.style.color = '#b91c1c';
      return;
    }
    st.textContent = locale === 'de' ? 'Wird hochgeladen…' : 'Uploading…';
    st.style.color = '';
    var entry = { promise: null, fileId: null, error: null };
    entry.promise = uploadSingleFile(file)
      .then(function (fid) {
        entry.fileId = fid;
        st.textContent = locale === 'de' ? '✓ Hochgeladen' : '✓ Uploaded';
        st.style.color = '#15803d';
      })
      .catch(function (err) {
        entry.error = err;
        // Clear the input so re-picking the SAME file still fires `change`
        // (Chromium/Safari skip the event when the selection is identical) —
        // otherwise the retry instruction dead-ends.
        input.value = '';
        st.textContent = locale === 'de'
          ? '✗ Upload fehlgeschlagen — bitte Datei erneut auswählen.'
          : '✗ Upload failed — please pick the file again.';
        st.style.color = '#b91c1c';
        logBlock('doc eager-upload failed (' + key + '): ' + (err && err.message ? err.message : 'unknown'));
      });
    docUploads[key] = entry;
  }

  DOC_INPUTS.forEach(function (d) {
    var el = document.getElementById(d.id);
    if (el) el.addEventListener('change', function () { startDocUpload(el, d.key); });
  });

  // Resolve every picked document to its uploaded file id, waiting for
  // in-flight uploads; throws (localized) when any picked file has no id.
  function collectDocIds() {
    var pending = [];
    var results = {};
    var failed = false;
    DOC_INPUTS.forEach(function (d) {
      var el = document.getElementById(d.id);
      if (!el || !el.files.length) return;
      var entry = docUploads[d.key];
      if (!entry || entry.error) {
        // Change listener missed, or the eager upload failed and the user
        // re-picked without a change event — retry the upload now.
        startDocUpload(el, d.key);
        entry = docUploads[d.key];
      }
      if (!entry) { failed = true; return; }
      pending.push(entry.promise.then(function () {
        if (entry.fileId) results[d.key] = entry.fileId;
        else failed = true;
      }));
    });
    return Promise.all(pending).then(function () {
      if (failed) {
        throw new Error(locale === 'de'
          ? 'Ein Dokument konnte nicht hochgeladen werden — bitte wähle die Datei erneut aus und versuche es nochmals.'
          : 'A document could not be uploaded — please re-select the file and try again.');
      }
      return results;
    });
  }

  function uploadSingleFile(file) {
    // Dedicated registration-upload endpoint: the file is created inside the
    // PRIVATE registration folder server-side (never anon-readable, unlike the
    // old anonymous POST /files which left folder-less files), with MIME/size
    // enforced by the backend too.
    return fetch(DIRECTUS_URL + '/kscw/registration/upload?filename=' + encodeURIComponent(file.name || 'document'), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('File upload failed');
        return r.json();
      })
      .then(function (data) {
        return data.id;
      });
  }

  // ── PDF pre-fill (basketball docs) ────────────────────────
  // Uses pdf-lib loaded on demand
  var pdfLibLoaded = false;

  function loadPdfLib() {
    if (pdfLibLoaded) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/js/pdf-lib.min.js';
      script.onload = function () { pdfLibLoaded = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function getFormValues() {
    return {
      vorname: val('vorname'),
      nachname: val('nachname'),
      email: val('email'),
      adresse: val('adresse'),
      plz: val('plz'),
      ort: val('ort'),
      geburtsdatum: val('geburtsdatum'),
      nationalitaet: natHidden ? natHidden.value : '',
      geschlecht: val('geschlecht'),
      nationalitaetCode: natCodes[0] || '',
      // Full set, so a form that asks "Swiss or other?" can honour a dual
      // national's Swiss passport instead of reading "Schweiz, Italien" as other.
      nationalitaetCodes: natCodes.slice(),
      situation: currentSituation(),
    };
  }

  function downloadPrefilled(pdfUrl, filename, fillFn) {
    loadPdfLib().then(function () {
      return fetch(pdfUrl).then(function (r) { return r.arrayBuffer(); });
    }).then(function (pdfBytes) {
      return PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true }).then(function (pdfDoc) {
        return pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          return { pdfDoc: pdfDoc, font: font };
        });
      });
    }).then(function (ctx) {
      var formData = getFormValues();
      formData._font = ctx.font;
      formData._fontSize = 10;
      fillFn(ctx.pdfDoc, formData);
      return ctx.pdfDoc.save();
    }).then(function (pdfBytes) {
      var blob = new Blob([pdfBytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      // The anchor must be in the document and the object URL must outlive the
      // click: revoking it synchronously races the browser's download, which
      // truncates the file — the bigger the PDF, the likelier a half-written,
      // unreadable download (the Acknowledgment form is ~590 KB).
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (_) { /* already gone */ }
        URL.revokeObjectURL(url);
      }, 60000);
    }).catch(function (err) {
      // Fallback: open the blank PDF so the applicant still gets the form, but
      // record why the prefill failed — this path used to fail silently.
      logBlock('pdf prefill failed (' + pdfUrl + '): ' + (err && err.message ? err.message : 'unknown'));
      window.open(pdfUrl, '_blank');
    });
  }

  // Today's date in DD.MM.YYYY format for PDF prefill
  function todayDDMMYYYY() {
    var d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  // Current Swiss Basketball season as "YYYY/YYYY". Their administrative season
  // rolls over in July (2026-27 opened 23.07.2026), matching the July cut-off
  // isMinorFromDob() uses — so a form downloaded in August already says the new
  // season rather than the one that just ended.
  function currentSeasonLabel() {
    var now = new Date();
    var start = (now.getMonth() + 1) >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return start + '/' + (start + 1);
  }

  // Characters the PDF standard fonts (Helvetica et al.) can actually encode.
  // pdf-lib embeds them with WinAnsi — the same CP1252 repertoire the ClubDesk
  // name guard above checks against, so it reuses that map rather than keeping
  // a second copy in sync. Writing anything outside the set throws, which used
  // to take down the whole download rather than one field (see winAnsiSafe).
  function encodableInWinAnsi(ch) {
    var cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) return true;    // ASCII printable
    if (cp >= 0xa0 && cp <= 0xff) return true;    // Latin-1 supplement (ä ö ü é à ç ß …)
    return !!CP1252_EXTRA[cp];                    // CP1252 additions (Œ Š Ž ƒ € …)
  }

  // Fold a name into something Helvetica can render, character by character, so
  // accents WinAnsi already covers (é ü ö à) are kept verbatim and only the ones
  // it cannot (č ć ř ę ł đ ğ ő …) lose their diacritic. Without this, a single
  // Croatian or Polish name made pdfDoc.save() throw and the applicant silently
  // received a BLANK form — the download path's catch falls back to the empty
  // PDF, so it looked like the prefill had simply broken.
  var NON_DECOMPOSING = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ø': 'o', 'Ø': 'O', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T' };
  function winAnsiSafe(value) {
    var str = String(value == null ? '' : value);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (encodableInWinAnsi(ch)) { out += ch; continue; }
      if (NON_DECOMPOSING[ch]) { out += NON_DECOMPOSING[ch]; continue; }
      // Strip the combining marks NFD splits off (č → c + ̌ → c).
      var folded = '';
      try {
        folded = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      } catch (e) { folded = ''; }
      for (var j = 0; j < folded.length; j++) {
        if (encodableInWinAnsi(folded.charAt(j))) out += folded.charAt(j);
      }
    }
    return out;
  }

  // Helper: set text field with font at smaller size
  function setField(form, fieldName, value, font, fontSize) {
    var safe = winAnsiSafe(value);
    try {
      var field = form.getTextField(fieldName);
      field.setText(safe);
      field.setFontSize(fontSize);
      if (font) field.updateAppearances(font);
    } catch (e) {
      // Field absent or read-only is normal (forms differ per case); an encoding
      // error here would mean winAnsiSafe missed something, so make it findable.
      if (e && /encode/i.test(e.message || '')) logBlock('pdf field encode failed (' + fieldName + '): ' + e.message);
    }
  }

  // Lizenzantrag pre-fill (Swiss Basketball — exact field names from PDF)
  var lizenzLink = document.getElementById('bb-doc-lizenz');
  if (lizenzLink) {
    lizenzLink.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/lizenzantrag-swiss-basketball.pdf', 'lizenzantrag.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          setField(f, 'undefined', 'KSC Wiedikon', font, sz);
          setField(f, 'undefined_2', d.nachname, font, sz);
          setField(f, 'undefined_3', d.vorname, font, sz);
          setField(f, 'undefined_4', d.adresse, font, sz);
          setField(f, 'undefined_5', d.plz || '', font, sz);
          setField(f, 'undefined_6', d.ort || '', font, sz);
          setField(f, 'undefined_7', d.email, font, sz);

          if (d.geburtsdatum) {
            var dp = d.geburtsdatum.split('-');
            setField(f, 'Tag', dp[2] || '', font, sz);
            setField(f, 'Monat', dp[1] || '', font, sz);
            setField(f, 'Jahr', dp[0] || '', font, sz);
          }

          if (d.geschlecht === 'männlich') { try { f.getCheckBox('Mann').check(); } catch(e) {} }
          if (d.geschlecht === 'weiblich') { try { f.getCheckBox('Frau').check(); } catch(e) {} }

          // Holding a Swiss passport alongside another still ticks "Schweiz" —
          // the form asks whether the player is Swiss, not which passport is first.
          if ((d.nationalitaetCodes || []).indexOf('CH') !== -1) {
            try { f.getCheckBox('Schweiz').check(); } catch(e) {}
          } else if (d.nationalitaet) {
            try { f.getCheckBox('Andere').check(); } catch(e) {}
            setField(f, 'KOPIE DES PASSES ODER DER ID BEILAGEN', d.nationalitaet, font, sz);
          }

          // Tick the box matching the applicant's situation (the PDF's transfer
          // checkboxes); default to "new member" when no situation was picked.
          var sitBox = {
            neu: 'Neues Mitglied Swiss Basketball',
            transfer_ch: 'Klubtransfer',
            transfer_intl: 'Internationaler Transfer',
            rueckkehr: 'Internationaler Transfer',
          }[d.situation] || 'Neues Mitglied Swiss Basketball';
          try { f.getCheckBox(sitBox).check(); } catch(e) {}

          var today = todayDDMMYYYY();
          setField(f, 'Datum', today, font, sz);
          setField(f, 'Datum_2', today, font, sz);
          setField(f, 'Datum_3', today, font, sz);
        } catch (ex) { /* fallback: download blank */ }
      });
    });
  }

  // Player's Self Declaration pre-fill (FIBA — exact field names)
  var selfDeclLink = document.getElementById('bb-doc-selfdecl');
  if (selfDeclLink) {
    selfDeclLink.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/player-self-declaration-fiba.pdf', 'player-self-declaration.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          setField(f, 'Last Name', d.nachname, font, sz);
          setField(f, 'First Name', d.vorname, font, sz);
          setField(f, 'Nationality', d.nationalitaet, font, sz);
          setField(f, 'Current Club', 'KSC Wiedikon', font, sz);
          setField(f, 'Season', currentSeasonLabel(), font, sz);
          if (d.geburtsdatum) {
            var dp = d.geburtsdatum.split('-');
            setField(f, 'Text1.0.0', dp[2] || '', font, sz);
            setField(f, 'Text1.0.1', dp[1] || '', font, sz);
            setField(f, 'Text1.1.1', dp[0] || '', font, sz);
          }
          setField(f, 'Text2', d.vorname + ' ' + d.nachname, font, sz);
          setField(f, 'Text3', todayDDMMYYYY(), font, sz);
        } catch (ex) {}
      });
    });
  }

  // Acknowledgment of National Team Restriction pre-fill (FIBA — exact field
  // names). Replaces the former "National Team Declaration", which FIBA stopped
  // accepting for the 2026-27 season (Swiss Basketball licence mail, 22.07.2026).
  // Two fields are deliberately left blank: the federation of origin (we don't
  // know where the player is coming from) and the transfer date (set by Swiss
  // Basketball / FIBA, not by us).
  var natDeclLink = document.getElementById('bb-doc-natdecl');
  if (natDeclLink) {
    natDeclLink.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/acknowledgment-national-team-restriction-fiba.pdf', 'acknowledgment-national-team-restriction.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          var fullName = d.vorname + ' ' + d.nachname;
          setField(f, 'Player full name', fullName, font, sz);
          setField(f, 'Nationality  nationalities', d.nationalitaet, font, sz);
          setField(f, 'National Member Federation of destination', 'Swiss Basketball', font, sz);
          if (d.geburtsdatum) {
            var dp = d.geburtsdatum.split('-');
            setField(f, 'Date of birth DDMMYYYY', dp[2] + '/' + dp[1] + '/' + dp[0], font, sz);
          }
          // Signature block: player's name and date; the parent/legal
          // representative fills their own half by hand.
          setField(f, 'Name', fullName, font, sz);
          setField(f, 'Date', todayDDMMYYYY(), font, sz);
        } catch (ex) {}
      });
    });
  }

  // Freibrief / Lettre de sortie pre-fill (Swiss Basketball — exact field names).
  // The release itself is signed by the applicant's PREVIOUS club; we only
  // pre-fill the player's identity so they hand a partly-filled form to that club.
  var freibriefLink = document.getElementById('bb-doc-freibrief');
  if (freibriefLink) {
    freibriefLink.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/freibrief-swiss-basketball.pdf', 'freibrief.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          setField(f, 'undefined', d.nachname, font, sz);            // NOM / NAME
          // First-name field carries accented multi-language labels; look it up
          // tolerantly by substring so a codepoint mismatch can't silently skip it.
          // (Nationality is intentionally left blank — that field is a 3-letter
          // FIBA country code the applicant/old club fills, not our full name.)
          var flds = f.getFields();
          for (var i = 0; i < flds.length; i++) {
            // Match by name only — the pdf-lib bundle is minified so
            // constructor.name is mangled; setField() safely no-ops on a
            // non-text field (getTextField throws, caught) if a name ever collides.
            if (/PR.NOM|VORNAME/i.test(flds[i].getName())) {
              setField(f, flds[i].getName(), d.vorname, font, sz);
              break;
            }
          }
          if (d.geburtsdatum) {
            var dp = d.geburtsdatum.split('-');
            setField(f, 'undefined_2', (dp[2] || '') + '.' + (dp[1] || '') + '.' + (dp[0] || ''), font, sz); // DATE DE NAISSANCE
          }
        } catch (ex) {}
      });
    });
  }

  // U18 Parents authorisation pre-fill (FIBA parental consent — exact field
  // names). Signed by the parent; we pre-fill the child's name + new club.
  var u18Link = document.getElementById('bb-doc-u18parents');
  if (u18Link) {
    u18Link.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/u18-parents-authorisation-fiba.pdf', 'u18-parents-authorisation.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          setField(f, 'Surname First Name', d.nachname + ' ' + d.vorname, font, sz); // child
          setField(f, 'to new club', 'KSC Wiedikon', font, sz);
        } catch (ex) {}
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function val(id) {
    var el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  // ── URL param pre-selection ───────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var prefillType = params.get('type');
  if (prefillType) {
    var radio = form.querySelector('input[name="membership_type"][value="' + prefillType + '"]');
    if (radio) {
      radio.checked = true;
      onTypeChange();
    }
  }
})();
