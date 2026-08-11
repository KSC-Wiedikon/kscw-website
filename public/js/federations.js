/**
 * KSCW — national member federations, by sport.
 *
 * "Federation of origin" asks which BODY first licensed the applicant, and the
 * answer is sport-specific: an Italian volleyballer came from FIPAV, an Italian
 * basketballer from FIP. Not exhaustive — anything absent falls back to the
 * country name, which still answers the question, just less specifically.
 *
 * Two consumers read this, which is why it is a file of its own rather than a
 * table inside either of them:
 *   - public/js/registration-form.js — labels the federation-of-origin picker
 *     and pre-fills FIBA's Acknowledgment of National Team Restriction
 *   - src/pages/admin.astro — re-fills that same Acknowledgment from a stored
 *     registration
 * Both must spell a federation the same way: the applicant downloads the form
 * from the public page, the club may regenerate it from the admin, and Swiss
 * Basketball receives whichever arrives. Keyed by ISO 3166-1 alpha-2.
 *
 * ⚠ Mirrors wiedisync's `src/utils/federations.ts` (the member-facing picker)
 * and `directus/extensions/kscw-endpoints/src/federations.js` (admin emails),
 * which already carry the same warning about each other. All three currently
 * agree entry for entry — add a country to all three, or one surface names a
 * federation where another names its country for the same member.
 */
window.KSCW_FEDERATIONS = {
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
