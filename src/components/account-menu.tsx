"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { displayName, initialsFor } from "@/lib/account/display";
import { signOutAction } from "@/lib/auth/actions";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

function SignOutIcon({ className }: { className?: string }) {
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
      <path d="M15 3h3.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="m10 16 4-4-4-4" />
      <path d="M14 12H4" />
    </svg>
  );
}

const itemBase =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors";
const itemClass = `${itemBase} hover:bg-surface-hover`;
// Its own list rather than `itemClass` plus overrides: two `hover:bg-*`
// classes would be settled by stylesheet order, and `cn` does not merge them.
const signOutClass = `${itemBase} text-muted hover:bg-danger/10 hover:text-danger focus-visible:text-danger`;

/**
 * The signed-in person's corner of the site header: who is signed in, the way
 * to their stores and account settings, and Sign out. Opens and closes like
 * the storefront's language switcher — outside click and Escape both close it.
 */
export function AccountMenu({
  name,
  email,
  platformAdmin = false,
  t,
}: {
  name: string | null;
  email: string;
  /** Adds the way to the platform admin's moderation page. */
  platformAdmin?: boolean;
  t: AdminMessages["header"];
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

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={format(t.accountMenuFor, { name: displayName(name, email) })}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-semibold text-foreground transition-colors hover:bg-surface-hover"
      >
        <span aria-hidden>{initialsFor(name, email)}</span>
      </button>

      {open ? (
        <div className="absolute end-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg">
          <div className="px-2.5 pt-2 pb-2.5">
            {name ? <p className="truncate text-sm font-medium">{name}</p> : null}
            <p className="truncate text-xs text-muted" title={email}>
              {email}
            </p>
          </div>
          <div className="border-t border-border pt-1">
            <Link href="/dashboard" onClick={close} className={itemClass}>
              {t.yourStores}
            </Link>
            <Link href="/dashboard/account" onClick={close} className={itemClass}>
              {t.accountSettings}
            </Link>
            {platformAdmin ? (
              <Link href="/dashboard/platform" onClick={close} className={itemClass}>
                {t.platform}
              </Link>
            ) : null}
          </div>
          <form action={signOutAction} className="mt-1 border-t border-border pt-1">
            <button
              type="submit"
              className={signOutClass}
            >
              <SignOutIcon className="h-4 w-4 rtl:-scale-x-100" />
              {t.signOut}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
