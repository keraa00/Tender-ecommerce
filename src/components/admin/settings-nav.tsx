import { TabNav } from "@/components/ui/tab-nav";
import { storeAdminPath } from "@/lib/admin/links";
import { SETTINGS_NAV, settingsPath } from "@/lib/admin/nav";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * The row of tabs across the top of Settings. Rendered by the settings
 * layout, so the active tab comes from the segment below it: null on General,
 * `shipping` on every shipping page — zones and rates included.
 */
export async function SettingsNav({ storeSlug }: { storeSlug: string }) {
  const { t } = await getAdminI18n();

  return (
    <TabNav
      label={t.nav.settings}
      items={SETTINGS_NAV.map((section) => ({
        ...section,
        label: t.nav[section.label],
        href: storeAdminPath(storeSlug, settingsPath(section.segment)),
      }))}
    />
  );
}
