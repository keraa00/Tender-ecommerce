import { INTL_LOCALES, type Locale } from "../locales";

import { ar } from "./ar";
import { bs } from "./bs";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ja } from "./ja";
import { pt } from "./pt";
import { ru } from "./ru";
import { tr } from "./tr";
import { zh } from "./zh";

/**
 * Storefront copy in every supported language, one file per language.
 *
 * Plain data, no functions, so a slice of it can be handed to a Client
 * Component as a prop. Placeholders are `{name}` and are filled by `format()`;
 * counts go through `plural()`, which asks `Intl.PluralRules` for the category
 * rather than assuming English's one/other split — Bosnian and Russian need
 * `few` and `many` ("2 proizvoda", "5 товаров"), Arabic adds `zero` and `two`,
 * and Chinese and Japanese only ever use `other`.
 */

/** A string per plural category the language uses; `other` is the fallback. */
export type Plural = { [category in Intl.LDMLPluralRule]?: string } & {
  other: string;
};

export type Messages = typeof en;

export const MESSAGES: Record<Locale, Messages> = {
  en,
  ar,
  bs,
  de,
  es,
  fr,
  it,
  ja,
  pt,
  ru,
  tr,
  zh,
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

/** Picks the plural form `Intl` says this count takes, then fills `{count}`. */
export function plural(locale: Locale, count: number, forms: Plural): string {
  const tag = INTL_LOCALES[locale];
  const template = forms[new Intl.PluralRules(tag).select(count)] ?? forms.other;

  return format(template, { count: new Intl.NumberFormat(tag).format(count) });
}
