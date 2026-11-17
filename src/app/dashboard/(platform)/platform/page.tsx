import type { Metadata } from "next";
import Link from "next/link";

import { StoreMark } from "@/components/store-mark";
import { Badge, StoreStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { StoreStatus } from "@/lib/db/types";
import {
  setStoreFeaturedAction,
  suspendStoreAction,
  unsuspendStoreAction,
} from "@/lib/platform/actions";
import { listAllStores } from "@/lib/platform/queries";
import { storefrontPaths } from "@/lib/storefront/links";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.platform.moderation.title };
}

/**
 * Moderation for the platform admin: every store, newest first, with the two
 * levers the platform holds over a seller's store — whether the landing page
 * shows it, and whether it is reachable at all. A non-admin gets a 404 from
 * `requirePlatformAdmin`, not a hint that the page exists.
 *
 * Plain forms posting Server Actions, so it works before hydration and needs
 * no client code. Suspending is undone with one click, so it asks nothing.
 */
export default async function PlatformPage() {
  await requirePlatformAdmin("/dashboard/platform");
  const [stores, { t: messages, locale }] = await Promise.all([listAllStores(), getAdminI18n()]);
  const t = messages.platform.moderation;
  const counts = messages.platform.stores;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted text-pretty">{t.intro}</p>

      {stores.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {stores.map((store) => {
            const suspended = store.status === StoreStatus.SUSPENDED;
            return (
              <li
                key={store.id}
                className="flex flex-col gap-3 bg-surface px-4 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <StoreMark
                    name={store.name}
                    logoUrl={store.logoUrl}
                    accentColor={store.accentColor}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{store.name}</span>
                      <StoreStatusBadge status={store.status} />
                      {store.featured ? <Badge tone="success">{t.featured}</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-muted tabular">
                      {suspended ? (
                        <span dir="ltr">/s/{store.slug}</span>
                      ) : (
                        <Link
                          href={storefrontPaths(store.slug).home}
                          className="underline-offset-4 hover:underline"
                        >
                          <span dir="ltr">/s/{store.slug}</span>
                        </Link>
                      )}{" "}
                      · {store.owner.email} · {plural(locale, store._count.products, counts.products)}{" "}
                      · {plural(locale, store._count.orders, counts.orders)} ·{" "}
                      {format(t.opened, { date: formatDate(store.createdAt, locale) })}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <form action={setStoreFeaturedAction.bind(null, store.id, !store.featured)}>
                    <Button type="submit" size="sm" variant="secondary" disabled={suspended}>
                      {store.featured ? t.unfeature : t.feature}
                    </Button>
                  </form>
                  <form
                    action={
                      suspended
                        ? unsuspendStoreAction.bind(null, store.id)
                        : suspendStoreAction.bind(null, store.id)
                    }
                  >
                    <Button type="submit" size="sm" variant={suspended ? "secondary" : "danger"}>
                      {suspended ? t.unsuspend : t.suspend}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
