"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";

/**
 * The seller's language, and the few strings nearly every admin screen uses,
 * for Client Components. Provided once by the dashboard layout.
 *
 * Deliberately small: a section's own copy still arrives as a prop, the way
 * the storefront passes it, so the browser is only ever sent what the page on
 * screen shows. This holds the save bar, status badges and the like — pieces
 * that would otherwise need a slice threaded through every form.
 */
export type AdminClientI18n = {
  locale: Locale;
  /** The BCP 47 tag for `Intl` and `formatMoney()`. */
  intl: string;
  common: AdminMessages["common"];
  badges: AdminMessages["badges"];
};

const AdminI18nContext = createContext<AdminClientI18n | null>(null);

export function AdminI18nProvider({
  value,
  children,
}: {
  value: AdminClientI18n;
  children: ReactNode;
}) {
  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n(): AdminClientI18n {
  const value = useContext(AdminI18nContext);
  if (!value) throw new Error("useAdminI18n() needs an <AdminI18nProvider> above it.");
  return value;
}
