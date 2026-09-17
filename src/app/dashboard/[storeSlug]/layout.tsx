import Link from "next/link";

import { StoreStatusBadge } from "@/components/ui/badge";
import { getStoreContext } from "@/lib/stores/context";

export default async function StoreAdminLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[storeSlug]">) {
  const { storeSlug } = await params;
  // Membership is verified here, once, for every page nested beneath.
  const { store } = await getStoreContext(storeSlug);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        ← Your stores
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-6">
        <span
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-xl"
          style={{ backgroundColor: store.accentColor ?? "var(--border-strong)" }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {store.name}
          </h1>
          <Link
            href={`/s/${store.slug}`}
            className="text-sm text-muted underline-offset-4 hover:underline tabular"
          >
            /s/{store.slug} ↗
          </Link>
        </div>
        <StoreStatusBadge status={store.status} />
      </div>

      {/*
        Plain links rather than an active-state nav: the segment a request is on
        is already obvious from the page heading, and a client component here
        would opt the whole seller admin into hydration for two anchors.
      */}
      <nav className="mt-4 flex gap-4 text-sm">
        <Link
          href={`/dashboard/${store.slug}`}
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Overview
        </Link>
        <Link
          href={`/dashboard/${store.slug}/products`}
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Products
        </Link>
      </nav>

      {children}
    </div>
  );
}
