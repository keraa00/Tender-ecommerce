import { AdminI18nProvider } from "@/components/admin/admin-i18n";
import { localeDirection } from "@/lib/i18n/locales";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * Everything behind sign-in is in the seller's own language: the stores list
 * and account settings on the platform's host, and each store's admin on its
 * own. Set here, once, for all of it.
 *
 * `contents` keeps the wrapper out of the layout — the pages below lay
 * themselves out against `<body>` as before — while `lang` and `dir` are still
 * inherited, which is what mirrors the admin for Arabic. The root layout's
 * `<html lang="en">` is shared with the storefront, so it stays as it is; the
 * theme editor's preview sets the storefront's language inside this again.
 */
export default async function DashboardRootLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const { locale, intl, t } = await getAdminI18n();

  return (
    <div lang={locale} dir={localeDirection(locale)} className="contents">
      <AdminI18nProvider value={{ locale, intl, common: t.common, badges: t.badges }}>
        {children}
      </AdminI18nProvider>
    </div>
  );
}
