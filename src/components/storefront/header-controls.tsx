"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageSwitcher as SharedLanguageSwitcher } from "@/components/language-switcher";
import { setLocaleAction } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/cn";
import { BagIcon, MenuIcon } from "./icons";
import { Sheet, SheetHeader, usePanel } from "./storefront-ui";
import type { NavItem } from "./types";

const iconButton =
  "relative grid h-10 w-10 cursor-pointer place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground";

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function NavLinks({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Store" className={className}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({
  items,
  storeName,
  menuLabel,
  closeLabel,
}: {
  items: NavItem[];
  storeName: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const { panel, setPanel } = usePanel();
  const pathname = usePathname();
  const close = () => setPanel(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanel("menu")}
        aria-label={menuLabel}
        aria-expanded={panel === "menu"}
        className={cn(iconButton, "-ms-2 lg:hidden")}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <Sheet
        open={panel === "menu"}
        onClose={close}
        side="start"
        label={menuLabel}
        closeLabel={closeLabel}
      >
        <SheetHeader title={storeName} closeLabel={closeLabel} onClose={close} />
        <nav aria-label="Store" className="p-2">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-base transition-colors hover:bg-surface-hover",
                      active ? "font-medium" : "text-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}

/** The buyer's language, kept in the storefront's own cookie. */
export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  return <SharedLanguageSwitcher locale={locale} label={label} action={setLocaleAction} />;
}

/**
 * A link to the cart page that opens the drawer instead once JavaScript is
 * running — so the button still goes somewhere useful before hydration.
 */
export function CartButton({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  const { setPanel } = usePanel();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        setPanel("cart");
      }}
      aria-label={count > 0 ? `${label} (${count})` : label}
      className={cn(iconButton, "-me-2")}
    >
      <BagIcon className="h-5 w-5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute top-1 end-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold text-white tabular"
          style={{ backgroundColor: "var(--store-accent)" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
