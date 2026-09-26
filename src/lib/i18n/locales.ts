/**
 * Storefront languages. Only the storefront's own chrome is translated —
 * buttons, headings, empty states. Product titles and descriptions are the
 * seller's words and are shown as written.
 *
 * Dependency-free so the language switcher (a Client Component) can import it.
 */

export const LOCALES = ["en", "bs", "es", "it", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie the buyer's choice is kept in. Shared by every storefront. */
export const LOCALE_COOKIE = "tender_locale";

/** Each language named in itself, which is how a reader looks for their own. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  bs: "Bosanski",
  es: "Español",
  it: "Italiano",
  de: "Deutsch",
};

/** BCP 47 tags for `Intl` — number, currency and plural formatting. */
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  bs: "bs-BA",
  es: "es-ES",
  it: "it-IT",
  de: "de-DE",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
