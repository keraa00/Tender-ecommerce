import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { LOCALE_COOKIE, resolveLocale, type Locale } from "./locales";
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
