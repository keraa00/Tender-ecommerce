import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { ADMIN_MESSAGES, type AdminMessages } from "./admin";
import {
  ADMIN_LOCALE_COOKIE,
  INTL_LOCALES,
  LOCALE_COOKIE,
  resolveLocale,
  type Locale,
} from "./locales";
import { MESSAGES, type Messages } from "./messages";

/**
 * The buyer's storefront language, from the cookie the switcher writes. Anything
 * missing or unrecognised falls back to English rather than erroring — the
 * cookie is client-controlled and may hold anything.
 */
export const getStorefrontI18n = cache(
  async (): Promise<{ locale: Locale; t: Messages }> => {
    const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    return { locale, t: MESSAGES[locale] };
  },
);

export type AdminI18n = {
  locale: Locale;
  /** The BCP 47 tag for `Intl` and `formatMoney()`. */
  intl: string;
  t: AdminMessages;
};

/**
 * The seller's admin language, from its own cookie — see `ADMIN_LOCALE_COOKIE`
 * for why it is not the buyer's. Falls back to English the same way.
 *
 * Cached per request, so a page, its metadata and every badge on it share one
 * cookie read. Server Actions call it too, to say their errors in the language
 * the form was shown in.
 */
export const getAdminI18n = cache(async (): Promise<AdminI18n> => {
  const locale = resolveLocale(
    (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value,
  );
  return { locale, intl: INTL_LOCALES[locale], t: ADMIN_MESSAGES[locale] };
});
