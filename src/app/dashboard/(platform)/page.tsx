import type { Metadata } from "next";

import { StoreMark } from "@/components/store-mark";
import { StoreStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { FormNotice } from "@/components/ui/field";
import { initialsFor } from "@/lib/account/display";
import { storeAdminUrl } from "@/lib/admin/links";
import { accountPath } from "@/lib/admin/nav";
import { requireUser } from "@/lib/auth/session";
import { listStoresForUser } from "@/lib/stores/queries";

export const metadata: Metadata = { title: "Your stores" };

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const [stores, { deleted }] = await Promise.all([
    listStoresForUser(user.id),
    props.searchParams,
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {deleted === "1" ? (
        <div className="mb-6">
          <FormNotice>Store deleted.</FormNotice>
        </div>
      ) : null}

      {/* Who is signed in, and the way to everything about the account itself
          rather than one store. */}
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-subtle text-sm font-semibold"
        >
          {initialsFor(user.name, user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name ?? user.email}</p>
          {user.name ? <p className="truncate text-sm text-muted">{user.email}</p> : null}
        </div>
        <ButtonLink href={accountPath()} variant="secondary" size="sm">
          Account settings
        </ButtonLink>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your stores</h1>
          <p className="mt-1 text-sm text-muted">
            Each store is a separate tenant with its own catalogue, orders and
            Stripe account. Opening one takes you to its admin.
          </p>
        </div>
        {stores.length > 0 && (
          <ButtonLink href="/dashboard/new" size="sm">
            New store
          </ButtonLink>
        )}
      </div>

      {stores.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
          <h2 className="font-medium">You don&rsquo;t have a store yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">
            Open one and you&rsquo;ll have a live storefront in under a minute.
            You can connect Stripe and add products afterwards.
          </p>
          <ButtonLink href="/dashboard/new" className="mt-6" size="lg">
            Open your first store
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {stores.map((store) => (
            <li key={store.id}>
              {/*
                A plain anchor, not `next/link`: the store admin is served from
                another origin, so there is no client-side navigation to be had
                and a prefetch would only be a wasted request.
              */}
              <a
                href={storeAdminUrl(store.slug)}
                className="flex items-center gap-4 bg-surface px-4 py-4 transition-colors hover:bg-surface-hover"
              >
                <StoreMark
                  name={store.name}
                  logoUrl={store.logoUrl}
                  accentColor={store.accentColor}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{store.name}</p>
                  <p className="truncate text-sm text-muted tabular">
                    /s/{store.slug} · {store._count.products}{" "}
                    {store._count.products === 1 ? "product" : "products"} ·{" "}
                    {store._count.orders}{" "}
                    {store._count.orders === 1 ? "order" : "orders"}
                  </p>
                </div>
                <StoreStatusBadge status={store.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
