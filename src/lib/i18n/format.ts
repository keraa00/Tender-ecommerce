import { INTL_LOCALES, type Locale } from "./locales";

/**
 * Filling in translated copy: placeholders and plurals. Shared by the
 * storefront and the admin message sets.
 *
 * Dependency-free apart from the locale list, so a Client Component can fill a
 * template without pulling every language's messages into its bundle.
 */

/** A string per plural category the language uses; `other` is the fallback. */
export type Plural = { [category in Intl.LDMLPluralRule]?: string } & {
  other: string;
};

/** Fills `{name}` placeholders. Unknown names are left as written. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Picks the plural form `Intl` says this count takes, then fills `{count}` and
 * any other placeholders in `values`.
 *
 * `Intl.PluralRules` decides the category rather than English's one/other
 * split: Bosnian and Russian need `few` and `many` ("2 proizvoda",
 * "5 товаров"), Arabic adds `zero` and `two`, and Chinese and Japanese only
 * ever use `other`.
 */
export function plural(
  locale: Locale,
  count: number,
  forms: Plural,
  values: Record<string, string | number> = {},
): string {
  const tag = INTL_LOCALES[locale];
  const template = forms[new Intl.PluralRules(tag).select(count)] ?? forms.other;

  return format(template, {
    ...values,
    count: new Intl.NumberFormat(tag).format(count),
  });
}
