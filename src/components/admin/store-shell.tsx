"use client";

import Link, { useLinkStatus } from "next/link";
import { useSelectedLayoutSegment, useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { NavIcon } from "@/components/admin/nav-icons";
import { useNewOrders } from "@/components/admin/new-orders";
import { StoreMark } from "@/components/store-mark";
import { accountUrl, storeAdminPath } from "@/lib/admin/links";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";
import { describeNewOrders, formatNewOrderCount } from "@/lib/orders/live";

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
  store: {
    slug: string;
    name: string;
    logoUrl: string | null;
    accentColor: string | null;
  };
  /** Absolute when the admin has its own host, so these leave it deliberately. */
  allStoresUrl: string;
  storefrontUrl: string;
  userEmail: string;
  statusBadge: ReactNode;
  /** Setup is finished from the store's home page, so the badge links there. */
  setupIncomplete: boolean;
  children: ReactNode;
};

export function StoreShell({
  store,
  allStoresUrl,
  storefrontUrl,
  userEmail,
  statusBadge,
  setupIncomplete,
  children,
}: StoreShellProps) {
  const segment = useSelectedLayoutSegment();
  const segments = useSelectedLayoutSegments();
  const [menuOpen, setMenuOpen] = useState(false);
  // The orders list marks everything it shows as seen as soon as it mounts,
  // and says itself when more arrive. Counted here as well, the drawer would
  // paint the old number for a moment before dropping to nothing — so on that
  // page, from its first render on the server, there is no count.
  const onOrdersList = segments.length === 1 && segments[0] === "orders";
  const { count } = useNewOrders();
  const newOrders = onOrdersList ? 0 : count;

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
      setupIncomplete={setupIncomplete}
      activeSegment={segment}
      newOrders={newOrders}
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
            aria-label={newOrders > 0 ? `Open menu, ${describeNewOrders(newOrders)}` : "Open menu"}
            aria-expanded={menuOpen}
            className="relative -ml-1 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
          >
            {/* The count itself is in the drawer; closed, this is all that
                says there is something new in it. */}
            {newOrders > 0 ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background"
              />
            ) : null}
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

          <StoreMark
            name={store.name}
            logoUrl={store.logoUrl}
            accentColor={store.accentColor}
            size="xs"
          />
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
  setupIncomplete,
  activeSegment,
  newOrders,
}: Omit<StoreShellProps, "children"> & { activeSegment: string | null; newOrders: number }) {
  // On the home page the setup steps are already on screen.
  const badgeLinksHome = setupIncomplete && activeSegment !== null;

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
          <StoreMark
            name={store.name}
            logoUrl={store.logoUrl}
            accentColor={store.accentColor}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold tracking-tight">{store.name}</p>
            <p className="truncate text-xs text-muted tabular">/s/{store.slug}</p>
          </div>
        </div>

        <div className="mt-2.5 px-1">
          {badgeLinksHome ? (
            <Link
              href={storeAdminPath(store.slug)}
              title="Finish setting up your store"
              className="inline-flex rounded-full transition-opacity hover:opacity-80 cursor-pointer"
            >
              {statusBadge}
            </Link>
          ) : (
            statusBadge
          )}
        </div>
      </div>

      <nav aria-label="Store" className="flex-1 overflow-y-auto p-2">
        {ADMIN_NAV.map((group, index) => (
          <div
            key={group.label ?? index}
            className={cn(index > 0 && "mt-2 border-t border-border pt-2")}
          >
            {group.label ? (
              <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted">
                {group.label}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.sections.map((section) => {
                const active = section.segment === activeSegment;
                const count = section.segment === "orders" ? newOrders : 0;

                return (
                  <li key={section.label} className="relative">
                    <Link
                      href={storeAdminPath(store.slug, section.segment ?? undefined)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        section.opensStorefront && "pe-10",
                        active
                          ? "bg-surface-hover font-medium text-foreground"
                          : "text-muted hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <NavIcon name={section.icon} className="h-[18px] w-[18px]" />
                      <span className="flex-1">{section.label}</span>
                      {count > 0 ? (
                        <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium leading-5 text-primary-foreground tabular">
                          <span aria-hidden>{formatNewOrderCount(count)}</span>
                          <span className="sr-only">, {describeNewOrders(count)}</span>
                        </span>
                      ) : null}
                      <PendingDot />
                    </Link>
                    {/* A sibling of the link, not inside it: an anchor cannot
                        hold another, and this one leaves the admin. */}
                    {section.opensStorefront ? (
                      <a
                        href={storefrontUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View online store (opens in a new tab)"
                        title="View online store"
                        className="absolute inset-y-1 end-1 grid w-8 place-items-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground"
                      >
                        <ExternalIcon className="h-4 w-4" />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ExternalIcon className="h-[18px] w-[18px]" />
          View storefront
        </a>

        <div className="mt-1 flex items-center gap-2 px-2.5 pt-2">
          {/* Account settings live on the platform's own host, hence `<a>`. */}
          <a
            href={accountUrl()}
            className="min-w-0 flex-1 truncate text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
            title={`${userEmail} · Account settings`}
          >
            {userEmail}
          </a>
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

/**
 * Confirms a drawer click while the next page is on its way. Always rendered
 * and only its opacity changes, so the item never shifts when it appears.
 */
function PendingDot() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full bg-current transition-opacity",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
    />
  );
}

function ExternalIcon({ className }: { className?: string }) {
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
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
