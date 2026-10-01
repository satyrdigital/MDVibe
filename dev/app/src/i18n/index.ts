/**
 * UI strings. English is the source catalog and the fallback for every
 * missing key; Ukrainian and Russian are complete translations.
 * Language "system" follows the Windows display language and falls back to
 * English when that language is not available.
 */
import en from './en.json';
import uk from './uk.json';
import ru from './ru.json';

export type StringKey = keyof typeof en;
export type Language = 'en' | 'uk' | 'ru';
export type LanguageSetting = Language | 'system';

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'uk', name: 'Українська' },
  { id: 'ru', name: 'Русский' },
];

const CATALOGS: Record<Language, Record<string, string>> = { en, uk, ru };

let catalog: Record<string, string> = en;
let current: Language = 'en';

/** Maps BCP-47 tags (e.g. "uk-UA", "ru", "en-US") to a supported language. */
export function detectLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base === 'uk' || base === 'ru' || base === 'en') return base;
  }
  return 'en';
}

export function systemLanguage(): Language {
  const tags = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return detectLanguage(tags.filter(Boolean));
}

export function resolveLanguage(setting: LanguageSetting): Language {
  return setting === 'system' ? systemLanguage() : setting;
}

export function setLanguage(lang: Language): void {
  current = lang;
  catalog = { ...en, ...CATALOGS[lang] };
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function language(): Language {
  return current;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = catalog[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export { CATALOGS };
