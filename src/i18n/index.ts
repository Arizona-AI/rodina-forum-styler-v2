/**
 * i18n layer.
 *
 * Strategy: `t(key)` looks the key up in the active locale dictionary and
 * falls back to Russian (the shipping locale for the target audience),
 * then to the key itself. Settings-schema rows may pass display-ready
 * Russian literals through `t()` — they resolve as themselves.
 * `vars` interpolates `{name}` placeholders.
 */
import { RU } from "./ru";
import { EN } from "./en";

type Dictionary = Record<string, string>;

const LOCALES: Record<string, Dictionary> = { ru: RU, en: EN };
const FALLBACK_LOCALE = "ru";

let activeLocale = FALLBACK_LOCALE;

export function setLocale(locale: string): void {
  activeLocale = locale in LOCALES ? locale : FALLBACK_LOCALE;
}

export function getLocale(): string {
  return activeLocale;
}

export function availableLocales(): string[] {
  return Object.keys(LOCALES);
}

/**
 * Translate a key; unknown keys fall back to RU, then to the key itself.
 * `vars` interpolates `{name}` placeholders (e.g. t("themes.count", {count: 5})).
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = LOCALES[activeLocale]?.[key] ?? RU[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Detect locale from the extension/browser language. */
export function detectLocale(browserLanguages: readonly string[] = navigator.languages): string {
  for (const lang of browserLanguages) {
    const short = lang.toLowerCase().slice(0, 2);
    if (short in LOCALES) return short;
  }
  return FALLBACK_LOCALE;
}
