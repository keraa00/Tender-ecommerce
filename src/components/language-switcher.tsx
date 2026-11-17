"use client";

import { useEffect, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon, GlobeIcon } from "@/components/storefront/icons";
import { cn } from "@/lib/cn";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * A menu of every language, each option a submit button named `locale`, so it
 * works as a plain form post before hydration too. The menu closes once the
 * action has stored the choice and the page has re-rendered in the new
 * language, rather than on click — so it never flashes shut over old copy.
 *
 * Shared by the storefront, which stores the buyer's language, and the admin,
 * which stores the seller's: `action` is what decides which.
 */
export function LanguageSwitcher({
  locale,
  label,
  action,
  placement = "below",
  showName = false,
  className,
}: {
  locale: Locale;
  label: string;
  action: (formData: FormData) => Promise<void>;
  /** "above" for a switcher at the bottom of the screen, like the admin drawer's. */
  placement?: "below" | "above";
  /** The language's own name on the trigger ("Deutsch") rather than its code. */
  showName?: boolean;
  /** Replaces the trigger's look; the storefront header's is the default. */
  className?: string;
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
        className={cn(
          "flex cursor-pointer items-center rounded-lg transition-colors hover:bg-surface-hover hover:text-foreground",
          className ?? "h-10 gap-1.5 px-2 text-sm font-medium text-foreground/80",
        )}
      >
        <GlobeIcon className="h-[18px] w-[18px]" />
        {showName ? (
          <span className="flex-1 text-start">{LOCALE_NAMES[locale]}</span>
        ) : (
          <span className="uppercase">{locale}</span>
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 text-muted" />
      </button>

      {open ? (
        <form
          action={async (formData) => {
            await action(formData);
            setOpen(false);
          }}
          className={cn(
            "absolute z-50 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg",
            placement === "above" ? "start-0 bottom-full mb-1" : "end-0 mt-1",
          )}
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
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm text-foreground transition-colors hover:bg-surface-hover"
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
