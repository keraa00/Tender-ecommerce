import type { Metadata } from "next";

import { StoreMark } from "@/components/store-mark";
import { StoreStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { FormNotice } from "@/components/ui/field";
import { initialsFor } from "@/lib/account/display";
import { storeAdminUrl } from "@/lib/admin/links";
import { accountPath } from "@/lib/admin/nav";
import { requireUser } from "@/lib/auth/session";
import { plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { listStoresForUser } from "@/lib/stores/queries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.platform.stores.title };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const [stores, { deleted }, { t: messages, locale }] = await Promise.all([
    listStoresForUser(user.id),
    props.searchParams,
    getAdminI18n(),
  ]);
  const t = messages.platform.stores;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {deleted === "1" ? (
        <div className="mb-6">
          <FormNotice>{t.deleted}</FormNotice>
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
        {user.platformRole === "PLATFORM_ADMIN" ? (
          <ButtonLink href="/dashboard/platform" variant="secondary" size="sm">
            {t.platform}
          </ButtonLink>
        ) : null}
        <ButtonLink href={accountPath()} variant="secondary" size="sm">
          {t.accountSettings}
        </ButtonLink>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.intro}</p>
        </div>
        {stores.length > 0 && (
          <ButtonLink href="/dashboard/new" size="sm">
            {t.newStore}
          </ButtonLink>
        )}
      </div>

      {stores.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
          <h2 className="font-medium">{t.emptyTitle}</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">{t.emptyBody}</p>
          <ButtonLink href="/dashboard/new" className="mt-6" size="lg">
            {t.openFirst}
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
                    <span dir="ltr">/s/{store.slug}</span> ·{" "}
                    {plural(locale, store._count.products, t.products)} ·{" "}
                    {plural(locale, store._count.orders, t.orders)}
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
