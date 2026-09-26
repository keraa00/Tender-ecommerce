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
  side: "left" | "right" | "top";
  label: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
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
    initial?.focus();

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-foreground/40 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-background shadow-xl outline-none",
          side === "right" &&
            "inset-y-0 right-0 w-full max-w-md border-l border-border",
          side === "left" &&
            "inset-y-0 left-0 w-80 max-w-[85vw] border-r border-border",
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
        className="-mr-2 grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
