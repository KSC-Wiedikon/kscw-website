// Single source of truth for translations: the same dictionary the client-side
// i18n engine (public/js/i18n.js) loads at runtime. Build-time render uses it
// for the German default; the engine swaps to English in place.
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';
// Page-text overrides saved by an admin in /admin → Seitentexte, pulled from
// Directus by scripts/fetch-site-text.mjs on every build. Committed empty, so a
// checkout with no Directus access still renders a complete site from the
// dictionaries alone. Layering them here is what puts an edit into the German
// build output — and in front of a crawler; public/js/i18n.js applies the same
// overrides in the browser so an edit shows up without waiting for a rebuild.
import overrides from '../generated/site-text.json';

const translations: Record<string, Record<string, string>> = {
  de: { ...de, ...overrides.de },
  en: { ...en, ...overrides.en },
};
export type Locale = 'de' | 'en';

export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.de[key] ?? key;
}
