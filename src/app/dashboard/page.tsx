import type { Metadata } from "next";
import Link from "next/link";

import { StoreStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { listStoresForUser } from "@/lib/stores/queries";

export const metadata: Metadata = { title: "Your stores" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const stores = await listStoresForUser(user.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your stores</h1>
          <p className="mt-1 text-sm text-muted">
            Each store is a separate tenant with its own catalogue, orders and
            Stripe account.
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
              <Link
                href={`/dashboard/${store.slug}`}
                className="flex items-center gap-4 bg-surface px-4 py-4 transition-colors hover:bg-surface-hover"
              >
                <span
                  aria-hidden
                  className="h-9 w-9 shrink-0 rounded-lg"
                  style={{
                    backgroundColor: store.accentColor ?? "var(--border-strong)",
                  }}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
