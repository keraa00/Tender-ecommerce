"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";

import { getAdminRouting } from "@/lib/admin/host";
import { ADMIN_LOCALE_COOKIE, LOCALE_COOKIE, isLocale } from "./locales";

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

/**
 * Stores the seller's admin language, the same way.
 *
 * Scoped to the domain the auth cookie spans, when there is one: the store
 * admin is served from `admin.<root>` while the stores list and account
 * settings stay on the root host, and one choice should cover both. Without
 * a split there is one host, and a host-only cookie already covers it.
 */
export async function setAdminLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  (await cookies()).set(ADMIN_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain: getAdminRouting()?.cookieDomain ?? undefined,
  });

  refresh();
}
