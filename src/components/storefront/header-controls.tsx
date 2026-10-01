"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/cn";
import {
  BagIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  MenuIcon,
} from "./icons";
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

/**
 * Each option is a submit button named `locale`. The menu closes once the
 * action has stored the choice and the page has re-rendered in the new
 * language, rather than on click — so it never flashes shut over old copy.
 */
export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${LOCALE_NAMES[locale]}`}
        className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <GlobeIcon className="h-[18px] w-[18px]" />
        <span className="uppercase">{locale}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-muted" />
      </button>

      {open ? (
        <form
          action={async (formData) => {
            await setLocaleAction(formData);
            setOpen(false);
          }}
          className="absolute end-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-xs text-muted">{label}</p>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="submit"
              name="locale"
              value={option}
              lang={option}
              aria-current={option === locale ? "true" : undefined}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors hover:bg-surface-hover"
            >
              <span className="w-6 text-xs font-medium text-muted uppercase">
                {option}
              </span>
              <span className="flex-1">{LOCALE_NAMES[option]}</span>
              {option === locale ? <CheckIcon className="h-4 w-4" /> : null}
            </button>
          ))}
        </form>
      ) : null}
    </div>
  );
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
