import { TabNav } from "@/components/ui/tab-nav";
import { ACCOUNT_NAV, accountPath } from "@/lib/admin/nav";
import { getAdminI18n } from "@/lib/i18n/server";

/** The tabs across the top of account settings. */
export async function AccountNav() {
  const { t } = await getAdminI18n();

  return (
    <TabNav
      label={t.nav.accountSettings}
      items={ACCOUNT_NAV.map((section) => ({
        ...section,
        label: t.nav[section.label],
        href: accountPath(section.segment),
      }))}
    />
  );
}
