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

  // Build sorted lists: favorites first, then alphabetical rest
  var favorites = COUNTRIES.filter(function (c) { return FAVORITE_CODES.indexOf(c.code) !== -1; });
  favorites.sort(function (a, b) { return FAVORITE_CODES.indexOf(a.code) - FAVORITE_CODES.indexOf(b.code); });
  var rest = COUNTRIES.filter(function (c) { return FAVORITE_CODES.indexOf(c.code) === -1; });
  rest.sort(function (a, b) { return countryName(a).localeCompare(countryName(b), locale); });

  // ── Searchable nationality dropdown ──────────────────────────
  var natWrapper = document.querySelector('.nationality-wrapper');
  var natTrigger = document.getElementById('nationality-trigger');
  var natTriggerText = document.getElementById('nationality-trigger-text');
  var natDropdown = document.getElementById('nationality-dropdown');
  var natSearch = document.getElementById('nationality-search');
  var natOptions = document.getElementById('nationality-options');
  var natHidden = document.getElementById('nationalitaet');

  function renderNationalityOptions(filter) {
    natOptions.innerHTML = '';
    var q = (filter || '').toLowerCase();
    var highlighted = 0;

    function addOption(c) {
      var name = countryName(c);
      if (q && name.toLowerCase().indexOf(q) === -1 && c.code.toLowerCase().indexOf(q) === -1) return false;
      var div = document.createElement('div');
      div.className = 'nationality-opt' + (natHidden.value === name ? ' selected' : '');
      div.textContent = name;
      div.dataset.value = name;
      div.dataset.code = c.code;
      div.addEventListener('click', function () { selectNationality(name, c.code); });
      natOptions.appendChild(div);
      highlighted++;
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

  function selectNationality(name, code) {
    natHidden.value = name;
    natHidden.dataset.code = code || '';
    natTriggerText.textContent = name;
    natWrapper.classList.remove('open');
    natSearch.value = '';
    // Trigger foreign docs visibility
    updateForeignDocs(code);
  }

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

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (natWrapper && !natWrapper.contains(e.target)) {
      natWrapper.classList.remove('open');
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

  // ── Foreign docs toggle (basketball) ─────────────────────────
  function updateForeignDocs(countryCode) {
    var foreignDocs = document.querySelectorAll('.bb-doc-foreign');
    var isForeign = countryCode !== 'CH';
    for (var i = 0; i < foreignDocs.length; i++) {
      foreignDocs[i].style.display = isForeign ? '' : 'none';
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
    var vbRequired = selType === 'volleyball' && isUnderAge(dobVal, 23);
    var bbRequired = selType === 'basketball' && isUnderAge(dobVal, 25);
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

    // AHV required only if under 25 (override the conditional-required)
    updateAhvRequired();

    // Reset funktion dropdowns and hide team wrappers when switching type
    if (funktionVb) { funktionVb.selectedIndex = 0; }
    if (funktionBb) { funktionBb.selectedIndex = 0; }
    var vbTeamW = document.getElementById('vb-team-wrapper');
    var bbTeamW = document.getElementById('bb-team-wrapper');
    if (vbTeamW) vbTeamW.style.display = 'none';
    if (bbTeamW) bbTeamW.style.display = 'none';
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
        // silently bounce the user with an empty token.
        logBlock('turnstile token expired — auto-resetting');
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
    if (/^hu\d|^mu\d|^herren|^h-classics/.test(n)) return 'männlich';
    return 'mixed';
  }

  function onFunktionChange(sport) {
    var funktionEl = sport === 'volleyball' ? funktionVb : funktionBb;
    var teamWrapper = document.getElementById(sport === 'volleyball' ? 'vb-team-wrapper' : 'bb-team-wrapper');
    if (!funktionEl || !teamWrapper) return;

    var funktion = funktionEl.value;
    var showTeam = funktion === 'Spieler*in' || funktion === 'Trainer*in' || funktion === 'Teamverantwortliche*r';
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
  var teamCache = {};

  function fetchTeams(sport) {
    var containerId = sport === 'volleyball' ? 'vb-team' : 'bb-team';
    var container = document.getElementById(containerId);
    if (!container) return;

    if (teamCache[sport]) {
      populateTeams(container, teamCache[sport]);
      return;
    }

    fetch(DIRECTUS_URL + '/items/teams?filter[sport][_eq]=' + sport +
      '&filter[active][_eq]=true&fields=id,name,league&sort=name&limit=-1')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var teams = (data && data.data) ? data.data : [];
        teamCache[sport] = teams;
        populateTeams(container, teams);
      })
      .catch(function () { /* silent */ });
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
      // Also close nationality
      if (natWrapper && natWrapper !== wrapper) natWrapper.classList.remove('open');
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

    if (type === 'basketball') {
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
      // Nationality drives whether the two extra FIBA documents are required.
      var natCode = natHidden ? (natHidden.dataset.code || '') : '';
      if (!natCode) {
        logBlock('blocked: bb nationality not selected');
        return showFeedback('error', locale === 'de'
          ? 'Bitte wähle deine Nationalität.'
          : 'Please select your nationality.');
      }
      // Non-Swiss players must additionally upload the signed Player's Self
      // Declaration + National Team Declaration (Swiss Basketball requirement):
      // 5 documents in total instead of 3. Without this, a non-Swiss applicant
      // could submit with only the 3 base documents and it went through silently.
      if (natCode !== 'CH') {
        var selfDecl = document.getElementById('bb-doc-selfdecl-upload');
        if (selfDecl && !selfDecl.files.length) {
          logBlock('blocked: bb self-declaration missing (non-Swiss)');
          return showFeedback('error', locale === 'de'
            ? 'Als nicht-Schweizer Spieler:in musst du zusätzlich die unterschriebene «Player’s Self Declaration» hochladen.'
            : 'As a non-Swiss player you must also upload the signed "Player’s Self Declaration".');
        }
        var natDecl = document.getElementById('bb-doc-natdecl-upload');
        if (natDecl && !natDecl.files.length) {
          logBlock('blocked: bb national-team-declaration missing (non-Swiss)');
          return showFeedback('error', locale === 'de'
            ? 'Als nicht-Schweizer Spieler:in musst du zusätzlich die unterschriebene «National Team Declaration» hochladen.'
            : 'As a non-Swiss player you must also upload the signed "National Team Declaration".');
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

    setLoading(true);

    // Build full phone number: "+41 79 123 45 67" format
    var phoneCode = document.getElementById('phone-country');
    var phoneNum = val('telefon').replace(/^\s+|\s+$/g, '');
    var dialCode = '';
    if (phoneCode) {
      var selOpt = phoneCode.options[phoneCode.selectedIndex];
      dialCode = selOpt ? selOpt.dataset.dial : '';
    }
    var fullPhone = dialCode ? (dialCode + ' ' + phoneNum) : phoneNum;

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
      nationalitaet: natHidden ? natHidden.value : '',
      nationalitaet_code: natHidden ? (natHidden.dataset.code || '') : '',
      geschlecht: val('geschlecht'),
      bemerkungen: val('bemerkungen'),
      turnstile_token: turnstileToken,
      locale: locale,
    };

    if (type === 'volleyball') {
      payload.anrede = anredeHidden ? anredeHidden.value : '';
      payload.rolle = val('funktion-vb');
      var vbTeams = [];
      form.querySelectorAll('input[name="team_vb"]:checked').forEach(function (cb) { vbTeams.push(cb.value); });
      payload.team = vbTeams.join(', ');
      payload.beitragskategorie = val('vb-fee');
      payload.ahv_nummer = val('vb-ahv');
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
      payload.ahv_nummer = val('bb-ahv');
      payload.kantonsschule = kantonsschuleValue('bb');
      // BB licence: scorer (radio, single choice) + referee (checkbox, combinable)
      var bbLicParts = [];
      var scorerRadio = form.querySelector('input[name="bb_scorer_licence"]:checked');
      if (scorerRadio && scorerRadio.value) bbLicParts.push(scorerRadio.value);
      var refCheck = document.getElementById('bb-ref-check');
      if (refCheck && refCheck.checked) bbLicParts.push('Schiedsrichter');
      payload.lizenz = bbLicParts.join(', ') || '';
    }

    if (type === 'passive') {
      payload.anrede = anredeHidden ? anredeHidden.value : '';
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

    // Step 1: Create registration (JSON)
    fetch(DIRECTUS_URL + '/kscw/registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || d.error || i18n.t('registrationError')); });
        return r.json();
      })
      .then(function (data) {
        // Step 2: Upload files for basketball (if any)
        if (type === 'basketball') {
          return uploadIDFiles(data.id, data.reference_number);
        }
      })
      .then(function () {
        showFeedback('success', i18n.t('registrationSuccess'));
        form.reset();
        // Reset custom UI
        if (natTriggerText) natTriggerText.textContent = '—';
        if (natHidden) natHidden.value = '';
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

  function uploadIDFiles(registrationId, referenceNumber) {
    var frontFile = document.getElementById('id-front').files[0];
    var backEl = document.getElementById('id-back');
    var backFile = backEl ? backEl.files[0] : null;

    // BB document uploads
    var lizenzDocEl = document.getElementById('bb-doc-lizenz-upload');
    var selfDeclDocEl = document.getElementById('bb-doc-selfdecl-upload');
    var natDeclDocEl = document.getElementById('bb-doc-natdecl-upload');
    var lizenzDoc = lizenzDocEl ? lizenzDocEl.files[0] : null;
    var selfDeclDoc = selfDeclDocEl ? selfDeclDocEl.files[0] : null;
    var natDeclDoc = natDeclDocEl ? natDeclDocEl.files[0] : null;

    var allFiles = [frontFile, backFile, lizenzDoc, selfDeclDoc, natDeclDoc].filter(Boolean);
    if (!allFiles.length) return Promise.resolve();

    // Validate all files before uploading
    for (var vi = 0; vi < allFiles.length; vi++) validateFile(allFiles[vi]);

    // Upload all files in parallel
    var uploads = [];
    var uploadKeys = [];
    if (frontFile) { uploads.push(uploadSingleFile(frontFile)); uploadKeys.push('id_upload_front'); }
    if (backFile) { uploads.push(uploadSingleFile(backFile)); uploadKeys.push('id_upload_back'); }
    if (lizenzDoc) { uploads.push(uploadSingleFile(lizenzDoc)); uploadKeys.push('bb_doc_lizenz'); }
    if (selfDeclDoc) { uploads.push(uploadSingleFile(selfDeclDoc)); uploadKeys.push('bb_doc_selfdecl'); }
    if (natDeclDoc) { uploads.push(uploadSingleFile(natDeclDoc)); uploadKeys.push('bb_doc_natdecl'); }

    return Promise.all(uploads).then(function (fileIds) {
      var body = { reference_number: referenceNumber };
      for (var ki = 0; ki < uploadKeys.length; ki++) {
        body[uploadKeys[ki]] = fileIds[ki];
      }

      return fetch(DIRECTUS_URL + '/kscw/registration/' + registrationId + '/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    });
  }

  function uploadSingleFile(file) {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'registrations');
    return fetch(DIRECTUS_URL + '/files', {
      method: 'POST',
      body: fd,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('File upload failed');
        return r.json();
      })
      .then(function (data) {
        return data.data.id;
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
      nationalitaetCode: natHidden ? (natHidden.dataset.code || '') : '',
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
      a.click();
      URL.revokeObjectURL(url);
    }).catch(function () {
      // Fallback: just open the blank PDF
      window.open(pdfUrl, '_blank');
    });
  }

  // Today's date in DD.MM.YYYY format for PDF prefill
  function todayDDMMYYYY() {
    var d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  // Helper: set text field with font at smaller size
  function setField(form, fieldName, value, font, fontSize) {
    try {
      var field = form.getTextField(fieldName);
      field.setText(value);
      field.setFontSize(fontSize);
      if (font) field.updateAppearances(font);
    } catch (e) { /* field not found or read-only */ }
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

          if (d.nationalitaet === 'Schweiz') {
            try { f.getCheckBox('Schweiz').check(); } catch(e) {}
          } else if (d.nationalitaet) {
            try { f.getCheckBox('Andere').check(); } catch(e) {}
            setField(f, 'KOPIE DES PASSES ODER DER ID BEILAGEN', d.nationalitaet, font, sz);
          }

          try { f.getCheckBox('Neues Mitglied Swiss Basketball').check(); } catch(e) {}

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
          setField(f, 'Season', '2025/2026', font, sz);
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

  // National Team Declaration pre-fill (FIBA — exact field names)
  var natDeclLink = document.getElementById('bb-doc-natdecl');
  if (natDeclLink) {
    natDeclLink.addEventListener('click', function (e) {
      e.preventDefault();
      downloadPrefilled('/docs/national-team-declaration-fiba.pdf', 'national-team-declaration.pdf', function (pdfDoc, d) {
        var f = pdfDoc.getForm();
        var font = d._font; var sz = d._fontSize;
        try {
          setField(f, 'Last Name Nom Nachname', d.nachname, font, sz);
          setField(f, 'First Name Prénom Vorname', d.vorname, font, sz);
          setField(f, 'Nationality Nationalité Nationalität', d.nationalitaet, font, sz);
          setField(f, 'Player Joueureuse Spielerin', d.vorname + ' ' + d.nachname, font, sz);
          setField(f, 'New Club Nouveau club Neuer Club', 'KSC Wiedikon', font, sz);
          setField(f, 'National Federation Fédération nationale', 'Swiss Basketball', font, sz);
          if (d.geburtsdatum) {
            var dp = d.geburtsdatum.split('-');
            setField(f, 'Date of birth Date de Naissance Geburtsdatum', dp[2] + '.' + dp[1] + '.' + dp[0], font, sz);
          }
          setField(f, 'Text1', 'Switzerland', font, sz);
          setField(f, 'Text2', 'Suisse', font, sz);
          setField(f, 'Text3', 'Schweiz', font, sz);
          setField(f, 'Date Date Datum', todayDDMMYYYY(), font, sz);
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
