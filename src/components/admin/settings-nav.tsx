"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { storeAdminPath } from "@/lib/admin/links";
import { SETTINGS_NAV, settingsPath } from "@/lib/admin/nav";
import { cn } from "@/lib/cn";

/**
 * The row of tabs across the top of Settings. Rendered by the settings
 * layout, so the active tab comes from the segment below it: null on General,
 * `shipping` on every shipping page — zones and rates included.
 *
 * The tabs wrap rather than scroll, so a phone never has to swipe sideways to
 * find the third one.
 */
export function SettingsNav({ storeSlug }: { storeSlug: string }) {
  const segment = useSelectedLayoutSegment();

  return (
    <nav aria-label="Settings">
      <ul className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {SETTINGS_NAV.map((section) => {
          const active = section.segment === segment;
          return (
            <li key={section.label}>
              <Link
                href={storeAdminPath(storeSlug, settingsPath(section.segment))}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-surface-hover font-medium text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
