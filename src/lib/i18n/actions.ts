"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";

import { LOCALE_COOKIE, isLocale } from "./locales";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Stores the buyer's language. Bound to a `<button name="locale">` so the
 * switcher works as a plain form post before hydration, too.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  refresh();
}
