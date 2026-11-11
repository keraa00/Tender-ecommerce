import { TabNav } from "@/components/ui/tab-nav";
import { ACCOUNT_NAV, accountPath } from "@/lib/admin/nav";

/** The tabs across the top of account settings. */
export function AccountNav() {
  return (
    <TabNav
      label="Account settings"
      items={ACCOUNT_NAV.map((section) => ({
        ...section,
        href: accountPath(section.segment),
      }))}
    />
  );
}
