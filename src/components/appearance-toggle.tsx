"use client";

import type { MouseEvent } from "react";

import { APPEARANCE_COOKIE, type Appearance } from "@/lib/appearance";

/**
 * Flips the landing pages between light and dark.
 *
 * Which icon shows is left to CSS (`home-dark:`), not to state, so the server
 * HTML and the first client render agree whatever the cookie or the system
 * says — no hydration mismatch, no icon popping in. The click writes the pick
 * onto the `.theme-home` wrapper directly and into the cookie the marketing
 * layout reads, so the next page load renders it from the server.
 */
export function AppearanceToggle() {
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const root = event.currentTarget.closest<HTMLElement>(".theme-home");
    if (!root) return;

    const dark = root.dataset.appearance
      ? root.dataset.appearance === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next: Appearance = dark ? "light" : "dark";

    document.cookie = `${APPEARANCE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;

    const apply = () => {
      root.dataset.appearance = next;
    };

    // A cross-fade of the whole page where the browser can do one.
    if (
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border bg-surface/70 text-muted transition-colors hover:border-border-strong hover:bg-surface hover:text-accent"
    >
      <MoonIcon className="col-start-1 row-start-1 h-4 w-4 transition duration-500 ease-out motion-reduce:transition-none home-dark:-rotate-90 home-dark:scale-0 home-dark:opacity-0" />
      <SunIcon className="col-start-1 row-start-1 h-4 w-4 rotate-90 scale-0 opacity-0 transition duration-500 ease-out motion-reduce:transition-none home-dark:rotate-0 home-dark:scale-100 home-dark:opacity-100" />
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  );
}
