// Single source of truth for translations: the same dictionary the client-side
// i18n engine (public/js/i18n.js) loads at runtime. Build-time render uses it
// for the German default; the engine swaps to English in place.
import de from '../../public/js/i18n/de.json';
import en from '../../public/js/i18n/en.json';

const translations: Record<string, Record<string, string>> = { de, en };
export type Locale = 'de' | 'en';

export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.de[key] ?? key;
}
