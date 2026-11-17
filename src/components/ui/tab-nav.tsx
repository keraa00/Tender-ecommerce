"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { NavIcon } from "@/components/admin/nav-icons";
import type { AdminIcon } from "@/lib/admin/nav";
import { cn } from "@/lib/cn";

export type TabNavItem = {
  /** The segment below the rendering layout that lights this tab, or null. */
  segment: string | null;
  href: string;
  label: string;
  icon: AdminIcon;
};

/**
 * A row of tabs across the top of a settings area. Rendered by that area's
 * layout, so the active tab comes from the segment below it — null on the
 * first tab, the folder name on every page nested under another.
 *
 * The tabs wrap rather than scroll, so a phone never has to swipe sideways to
 * find the third one.
 */
export function TabNav({
  label,
  items,
}: {
  label: string;
  items: readonly TabNavItem[];
}) {
  const segment = useSelectedLayoutSegment();

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {items.map((item) => {
          const active = item.segment === segment;
          return (
            <li key={item.segment ?? ""}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-surface-hover font-medium text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
