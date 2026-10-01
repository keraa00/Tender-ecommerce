"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { CloseIcon } from "./icons";

/**
 * The storefront's overlays — cart drawer, search, mobile menu — share one
 * piece of state: which of them, if any, is open. Keeping it in one place means
 * opening one closes the others, and the add-to-cart form can open the cart
 * without knowing where the cart is rendered.
 */

export type Panel = "cart" | "search" | "menu" | null;

const PanelContext = createContext<{
  panel: Panel;
  setPanel: (panel: Panel) => void;
} | null>(null);

export function StorefrontUIProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  return (
    <PanelContext.Provider value={{ panel, setPanel }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanel() {
  const context = useContext(PanelContext);
  if (!context) throw new Error("usePanel() outside <StorefrontUIProvider>");
  return context;
}

type SheetSide = "start" | "end" | "top";

// Where each side's sheet rests off-screen. It slides in from here on mount
// (`starting:` is `@starting-style`) and back out here before it unmounts.
const hiddenAt: Record<SheetSide, string> = {
  end: "translate-x-full rtl:-translate-x-full",
  start: "-translate-x-full rtl:translate-x-full",
  top: "-translate-y-full",
};
const enterFrom: Record<SheetSide, string> = {
  end: "starting:translate-x-full rtl:starting:-translate-x-full",
  start: "starting:-translate-x-full rtl:starting:translate-x-full",
  top: "starting:-translate-y-full",
};

/**
 * A modal sheet sliding in from one side (or dropping from the top). Escape
 * and the backdrop close it; the page behind stops scrolling while it is open;
 * focus moves in on open and returns to where it was on close.
 */
export function Sheet({
  open,
  onClose,
  side,
  label,
  closeLabel,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** `start`/`end` follow the reading direction, so they swap sides in Arabic. */
  side: SheetSide;
  label: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const backdropRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Outlives `open` by the length of the closing slide, so there is something
  // left on screen to slide out.
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  // Callers pass an inline closure; reading it through a ref keeps the effect
  // below from re-running — and re-stealing focus — on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Prefer a field the sheet marks as the place to start; otherwise the sheet.
    const initial =
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panelRef.current;
    // The sheet is still off-screen at this point; don't let focus scroll to it.
    initial?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Once closed, unmount when the slide out has finished. `getAnimations()`
  // flushes style, so the transitions just kicked off are in the list; under
  // reduced motion there are none and this settles straight away. Reopening
  // mid-slide cancels them, which rejects `finished` — nothing to do then.
  useEffect(() => {
    if (open || !present) return;
    let stale = false;
    const transitions = [backdropRef.current, panelRef.current].flatMap(
      (element) => element?.getAnimations() ?? [],
    );
    Promise.all(transitions.map((transition) => transition.finished)).then(
      () => {
        if (!stale) setPresent(false);
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [open, present]);

  if (!present) return null;

  return (
    <div
      inert={!open}
      className={cn("fixed inset-0 z-50", !open && "pointer-events-none")}
    >
      <button
        ref={backdropRef}
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={onClose}
        className={cn(
          "absolute inset-0 h-full w-full cursor-default bg-foreground/40 backdrop-blur-[1px]",
          "transition-opacity duration-500 ease-drawer starting:opacity-0 motion-reduce:transition-none",
          !open && "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-background shadow-xl outline-none",
          "transition-transform duration-500 ease-drawer motion-reduce:transition-none",
          enterFrom[side],
          !open && hiddenAt[side],
          side === "end" &&
            "inset-y-0 end-0 w-full max-w-md border-s border-border",
          side === "start" &&
            "inset-y-0 start-0 w-80 max-w-[85vw] border-e border-border",
          side === "top" && "inset-x-0 top-0 border-b border-border",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({
  title,
  closeLabel,
  onClose,
}: {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="-me-2 grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
