"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The save button for an admin edit screen, which appears only when there is
 * something to save.
 *
 * A long form — a product with a dozen variants and photos — used to end in its
 * only save button, so every edit meant a scroll to the bottom. This bar slides
 * down over the top of the window as soon as the form differs from its saved
 * version, wherever the seller is on the page, and slides away once saved.
 * It is fixed rather than in the page flow, so appearing never pushes the
 * form down under the cursor.
 *
 * "Changed" compares the form's current data with the last saved version,
 * rather than listening for typing, so pickers that change hidden inputs (add
 * a product, choose a collection) count too — and undoing an edit by hand
 * hides the bar again.
 */
export function SaveBar({
  label,
  pending,
  disabled = false,
  onDiscard,
  savedKey,
  className,
}: {
  label: string;
  pending: boolean;
  /** Blocks saving for a reason the form shows itself, like a bad file. */
  disabled?: boolean;
  /** Throws the edits away: the `discard` from `useDiscard`. */
  onDiscard: () => void;
  /**
   * Changes identity after each successful save — the action's state when it
   * carries a notice — so what is on screen becomes the new saved version.
   */
  savedKey?: unknown;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const baseline = useRef<string | null>(null);
  const rebaseOnReset = useRef(false);
  const [dirty, setDirty] = useState(false);

  const form = () => barRef.current?.closest("form") ?? null;

  function recompute() {
    const element = form();
    if (!element || baseline.current === null) return;
    setDirty(snapshot(element) !== baseline.current);
  }

  // The saved version is what the form holds once hydrated.
  useEffect(() => {
    const element = form();
    if (!element) return;
    baseline.current = snapshot(element);

    const onEdit = () => recompute();
    // React resets uncontrolled fields after an action completes, and a reset
    // fires no input events — so look again once it has happened.
    const onReset = () =>
      setTimeout(() => {
        if (rebaseOnReset.current) {
          baseline.current = snapshot(element);
          rebaseOnReset.current = false;
        }
        recompute();
      }, 0);

    element.addEventListener("input", onEdit);
    element.addEventListener("change", onEdit);
    element.addEventListener("reset", onReset);
    return () => {
      element.removeEventListener("input", onEdit);
      element.removeEventListener("change", onEdit);
      element.removeEventListener("reset", onReset);
    };
    // Mount only: the listeners read refs, not render-time values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled pickers re-render the form without an input event; check after
  // every render of the form this bar sits in.
  useEffect(() => {
    recompute();
  });

  // After a successful save, what is on screen is the saved version — once
  // React's post-action reset has settled, whichever comes first.
  useEffect(() => {
    if (savedKey === undefined) return;
    rebaseOnReset.current = true;
    const timer = setTimeout(() => {
      const element = form();
      if (element) baseline.current = snapshot(element);
      recompute();
    }, 0);
    const done = setTimeout(() => (rebaseOnReset.current = false), 1000);
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  // Leaving with unsaved work — reload, close, or type a new address — asks
  // first. In-app links are client navigations and do not fire this.
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  // Stays up while saving, so the seller sees the save happen.
  const visible = dirty || pending;

  return (
    <div
      ref={barRef}
      // Out of the way, but still in the DOM: the bar finds its form from here.
      aria-hidden={!visible}
      className={cn(
        // Over the content column: the whole width under the mobile header's
        // position on phones, beside the 16rem drawer on desktop.
        "fixed inset-x-0 top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur transition-transform duration-200 lg:left-64",
        visible ? "translate-y-0" : "invisible -translate-y-full",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <p
          aria-live="polite"
          className="flex min-w-0 items-center gap-2 truncate text-sm font-medium"
        >
          {pending ? null : (
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          )}
          {pending ? "Saving…" : "Unsaved changes"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onDiscard}>
            Discard
          </Button>
          <Button type="submit" size="sm" disabled={pending || disabled}>
            {pending ? "Saving…" : label}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Discard for an edit form, used by the component that renders it: put `key`
 * on the form's body and hand `discard` to its SaveBar.
 *
 * Discarding remounts the body, so everything — typed fields, picked products,
 * reordered rows, chosen files — starts again from the props the page passed
 * in. Those are the saved version even after a save here: every save action
 * revalidates, and Next re-renders the page in the same response.
 */
export function useDiscard() {
  const [key, setKey] = useState(0);
  return { key, discard: () => setKey((current) => current + 1) };
}

/** The form's data as one string: equal strings, nothing to save. */
function snapshot(form: HTMLFormElement): string {
  const parts: string[] = [];
  for (const [name, value] of new FormData(form)) {
    parts.push(
      `${name}=${typeof value === "string" ? value : `file:${value.name}:${value.size}`}`,
    );
  }
  return parts.join("&");
}
