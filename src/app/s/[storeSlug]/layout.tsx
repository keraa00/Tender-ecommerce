import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { getStoreBySlug } from "@/lib/stores/queries";
import { checkoutBlockedReason, isStorePubliclyVisible } from "@/lib/stores/policy";

export default async function StorefrontLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  const accent = store.accentColor ?? "var(--primary)";

  if (!isStorePubliclyVisible(store)) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-24 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            This store is unavailable
          </h1>
          <p className="mt-2 text-sm text-muted text-pretty">
            {store.name} has been suspended and is not currently trading.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            Browse other stores
          </Link>
        </div>
      </div>
    );
  }

  const blockedReason = checkoutBlockedReason(store);

  return (
    <div
      style={{ "--store-accent": accent } as CSSProperties}
      className="flex flex-1 flex-col"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href={`/s/${store.slug}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            {store.logoUrl ? (
              <Image
                src={store.logoUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ backgroundColor: "var(--store-accent)" }}
              />
            )}
            <span className="truncate text-lg font-semibold tracking-tight">
              {store.name}
            </span>
          </Link>

          <Link
            href="/"
            className="ml-auto text-sm text-muted underline-offset-4 hover:underline"
          >
            Tender
          </Link>
        </div>
      </header>

      {blockedReason && (
        <p
          role="status"
          className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-center text-sm text-warning sm:px-6"
        >
          {blockedReason} You can browse, but checkout is disabled.
        </p>
      )}

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted sm:px-6">
          {store.name} · Powered by{" "}
          <Link href="/" className="underline underline-offset-4">
            Tender
          </Link>
        </div>
      </footer>
    </div>
  );
}
