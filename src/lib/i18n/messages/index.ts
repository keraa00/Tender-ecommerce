import type { Locale } from "../locales";

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

export { format, plural, type Plural } from "../format";

/**
 * Storefront copy in every supported language, one file per language.
 *
 * Plain data, no functions, so a slice of it can be handed to a Client
 * Component as a prop. Placeholders are `{name}` and are filled by `format()`;
 * counts go through `plural()` — both in `../format`, which a Client Component
 * should import directly rather than through this file, which pulls in every
 * language.
 */

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
