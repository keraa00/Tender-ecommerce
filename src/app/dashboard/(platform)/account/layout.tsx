import Link from "next/link";

import { AccountNav } from "@/components/account/account-nav";
import { Arrow } from "@/components/admin/page-shell";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * Account settings: the person, not a store. Lives on the root host beside the
 * store list (`PLATFORM_DASHBOARD_SEGMENTS`). Each tab's page does its own
 * `requireUser()`, which is what carries it back here after signing in.
 */
export default async function AccountLayout({
  children,
}: LayoutProps<"/dashboard/account">) {
  const { t } = await getAdminI18n();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        <Arrow>←</Arrow> {t.account.back}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.account.title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted text-pretty">{t.account.intro}</p>

      <AccountNav />

      <div className="mt-8">{children}</div>
    </div>
  );
}
