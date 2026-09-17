"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { NavIcon } from "@/components/admin/nav-icons";
import { storeAdminPath } from "@/lib/admin/links";
import { ADMIN_SECTIONS } from "@/lib/admin/nav";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";

/**
 * The seller admin's chrome: a permanent left drawer on desktop, an overlay one
 * on small screens, and the page beside it.
 *
 * The store admin used to render two plain anchors and a comment explaining why
 * it stayed a Server Component. Six sections, an active state and a drawer that
 * opens and closes is a different problem, so this is a Client Component — but
 * only the chrome is. `children` arrives already rendered on the server, and
 * the status badge comes in as a prop for the same reason: it reads Prisma
 * enums, which have no business in the browser bundle.
 */

type StoreShellProps = {
  store: { slug: string; name: string; accentColor: string | null };
  /** Absolute when the admin has its own host, so these leave it deliberately. */
  allStoresUrl: string;
  storefrontUrl: string;
  userEmail: string;
  statusBadge: ReactNode;
  children: ReactNode;
};

export function StoreShell({
  store,
  allStoresUrl,
  storefrontUrl,
  userEmail,
  statusBadge,
  children,
}: StoreShellProps) {
  const segment = useSelectedLayoutSegment();
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating is the usual reason the drawer should close, and on mobile the
  // destination is hidden behind it until it does. Adjusted during render
  // rather than in an effect: React re-runs this pass before committing, so the
  // drawer is never painted open over the page it just navigated to. Keying off
  // the segment also covers the back button, which an onClick on the links
  // would miss.
  const [renderedSegment, setRenderedSegment] = useState(segment);
  if (segment !== renderedSegment) {
    setRenderedSegment(segment);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const drawer = (
    <DrawerContents
      store={store}
      allStoresUrl={allStoresUrl}
      storefrontUrl={storefrontUrl}
      userEmail={userEmail}
      statusBadge={statusBadge}
      activeSegment={segment}
    />
  );

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start border-r border-border bg-surface-subtle lg:block">
        {drawer}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-foreground/40 backdrop-blur-[1px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${store.name} menu`}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-background shadow-xl"
          >
            {drawer}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="-ml-1 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <StoreMark accentColor={store.accentColor} className="h-6 w-6" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {store.name}
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function DrawerContents({
  store,
  allStoresUrl,
  storefrontUrl,
  userEmail,
  statusBadge,
  activeSegment,
}: Omit<StoreShellProps, "children"> & { activeSegment: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-3">
        <a
          href={allStoresUrl}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          All stores
        </a>

        <div className="mt-2 flex items-start gap-2.5 px-1">
          <StoreMark accentColor={store.accentColor} className="mt-0.5 h-8 w-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold tracking-tight">{store.name}</p>
            <p className="truncate text-xs text-muted tabular">/s/{store.slug}</p>
          </div>
        </div>

        <div className="mt-2.5 px-1">{statusBadge}</div>
      </div>

      <nav aria-label="Store" className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {ADMIN_SECTIONS.map((section) => {
            const active = section.segment === activeSegment;

            return (
              <li key={section.label}>
                <Link
                  href={storeAdminPath(store.slug, section.segment ?? undefined)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-surface-hover font-medium text-foreground"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <NavIcon name={section.icon} className="h-[18px] w-[18px]" />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M14 4h6v6" />
            <path d="M20 4 10 14" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
          View storefront
        </a>

        <div className="mt-1 flex items-center gap-2 px-2.5 pt-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted" title={userEmail}>
            {userEmail}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StoreMark({
  accentColor,
  className,
}: {
  accentColor: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-lg", className)}
      style={{ backgroundColor: accentColor ?? "var(--border-strong)" }}
    />
  );
}
