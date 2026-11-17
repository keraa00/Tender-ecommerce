/**
 * The languages Tender speaks: the storefront's buyers and, separately, the
 * sellers in the admin. Only Tender's own copy is translated — buttons,
 * headings, empty states. Product titles and descriptions are the seller's
 * words and are shown as written.
 *
 * Dependency-free so the language switcher (a Client Component) can import it.
 */

/** English first as the default, then by code — the order the switcher lists. */
export const LOCALES = [
  "en",
  "ar",
  "bs",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "pt",
  "ru",
  "tr",
  "zh",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie the buyer's choice is kept in. Shared by every storefront. */
export const LOCALE_COOKIE = "tender_locale";

/**
 * The cookie the seller's admin language is kept in. Separate from the
 * buyer's, so browsing a shop in German leaves the admin as it was — and the
 * theme editor's preview keeps showing the storefront in the storefront's
 * language rather than the seller's.
 */
export const ADMIN_LOCALE_COOKIE = "tender_admin_locale";

/** Each language named in itself, which is how a reader looks for their own. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  bs: "Bosanski",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  pt: "Português",
  ru: "Русский",
  tr: "Türkçe",
  zh: "简体中文",
};

/**
 * BCP 47 tags for `Intl` — number, currency and plural formatting.
 *
 * Arabic pins Western digits (`nu-latn`): they are what Arabic-language shops
 * mostly show, and without the pin some regions and ICU versions switch to
 * Arabic-Indic digits, so a price could render differently server and client.
 */
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-u-nu-latn",
  bs: "bs-BA",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  pt: "pt-BR",
  ru: "ru-RU",
  tr: "tr-TR",
  zh: "zh-CN",
};

/** Arabic reads right to left; the layout is mirrored to match. */
export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
