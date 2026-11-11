import { TabNav } from "@/components/ui/tab-nav";
import { storeAdminPath } from "@/lib/admin/links";
import { SETTINGS_NAV, settingsPath } from "@/lib/admin/nav";

/**
 * The row of tabs across the top of Settings. Rendered by the settings
 * layout, so the active tab comes from the segment below it: null on General,
 * `shipping` on every shipping page — zones and rates included.
 */
export function SettingsNav({ storeSlug }: { storeSlug: string }) {
  return (
    <TabNav
      label="Settings"
      items={SETTINGS_NAV.map((section) => ({
        ...section,
        href: storeAdminPath(storeSlug, settingsPath(section.segment)),
      }))}
    />
  );
}
