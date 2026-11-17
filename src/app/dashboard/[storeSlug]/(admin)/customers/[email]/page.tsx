import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";

import {
  AdminPage,
  Row,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { formatAddressLines } from "@/lib/address/validate";
import { storeAdminPath } from "@/lib/admin/links";
import { customerEmailFromParam, customerSegments } from "@/lib/customers/filters";
import { getStoreCustomer } from "@/lib/customers/queries";
import { formatDate } from "@/lib/dates";
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

// Shared by the metadata and the page, which render in the same request. Keyed
// on the normalised email, since the two are handed the param in different
// encodings (see `customerEmailFromParam`).
const loadCustomer = cache(async (storeSlug: string, email: string) => {
  const { store } = await getStoreContext(storeSlug);
  return { store, detail: await getStoreCustomer(store.id, email) };
});

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/customers/[email]">,
): Promise<Metadata> {
  const { storeSlug, email } = await props.params;
  const [{ detail }, { t }] = await Promise.all([
    loadCustomer(storeSlug, customerEmailFromParam(email)),
    getAdminI18n(),
  ]);
  return {
    title: detail
      ? `${detail.customer.name ?? detail.customer.email} · ${t.customers.title}`
      : t.customers.detail.fallbackTitle,
  };
}

export default async function CustomerPage(
  props: PageProps<"/dashboard/[storeSlug]/customers/[email]">,
) {
  const { storeSlug, email } = await props.params;

  // `storeId` is part of every lookup, so an address that has only ever paid
  // another store 404s here — as does one that has only abandoned checkouts.
  const [{ store, detail }, { t: messages, locale, intl }] = await Promise.all([
    loadCustomer(storeSlug, customerEmailFromParam(email)),
    getAdminI18n(),
  ]);
  if (!detail) notFound();
  const t = messages.customers.detail;
  const money = (cents: number, currency = store.currency) => formatMoney(cents, currency, intl);

  const { customer, orders, redemptions, lastAddress } = detail;
  const segments = customerSegments(customer, new Date());
  const unsettled = orders.length - customer.orders;

  return (
    <AdminPage
      title={customer.name ?? customer.email}
      back={{ href: storeAdminPath(store.slug, "customers"), label: messages.customers.title }}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {customer.name ? <span>{customer.email}</span> : null}
          <Badge>{customer.hasAccount ? messages.customers.signedIn : messages.customers.guest}</Badge>
        </span>
      }
    >
      <StatGrid>
        <Stat
          label={t.totalSpent}
          value={money(customer.spentCents)}
          hint={t.totalSpentHint}
        />
        <Stat
          label={t.orders}
          value={new Intl.NumberFormat(intl).format(customer.orders)}
          hint={
            unsettled > 0
              ? format(t.unsettled, { count: new Intl.NumberFormat(intl).format(unsettled) })
              : undefined
          }
        />
        <Stat
          label={t.averageOrder}
          value={money(Math.round(customer.spentCents / customer.orders))}
        />
        <Stat
          label={t.lastOrder}
          value={formatDate(customer.lastOrderAt, locale)}
          hint={
            customer.orders === 1
              ? t.onlyOrder
              : format(t.firstOn, { date: formatDate(customer.firstOrderAt, locale) })
          }
        />
      </StatGrid>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <h2 className="text-lg font-medium tracking-tight">{t.orders}</h2>
          <p className="mt-1 text-sm text-muted text-pretty">{t.ordersBody}</p>

          <Rows className="mt-4">
            {orders.map((order) => (
              <Row key={order.id}>
                <div className="w-16 shrink-0 font-medium tabular">
                  #{order.orderNumber}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={storeAdminPath(store.slug, `orders/${order.id}`)}
                    className="block truncate text-sm text-muted tabular hover:text-foreground"
                  >
                    {formatDate(order.createdAt, locale)} ·{" "}
                    {plural(locale, order.itemCount, messages.orders.items)}
                    {order.shippingRateName ? ` · ${order.shippingRateName}` : ""}
                  </Link>
                </div>

                <div className="shrink-0 text-end font-medium tabular">
                  {money(order.totalCents, order.currency)}
                </div>

                <div className="shrink-0">
                  <OrderStatusBadge status={order.status} paymentMethod={order.paymentMethod} />
                </div>
              </Row>
            ))}
          </Rows>
        </section>

        <aside className="space-y-4">
          <Panel title={t.segments}>
            {segments.length === 0 ? (
              <p className="text-sm text-muted">{t.noSegment}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {segments.map((segment) => (
                  <li key={segment}>
                    <Badge>{messages.segments[segment].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted text-pretty">{t.segmentsNote}</p>
          </Panel>

          <Panel title={t.shippingAddress}>
            {lastAddress ? (
              <>
                <address className="text-sm not-italic">
                  {formatAddressLines(lastAddress.address, intl).map((line, index) => (
                    <span key={index} className="block">
                      {line}
                    </span>
                  ))}
                  {lastAddress.address.phone ? (
                    <span className="mt-1 block text-muted" dir="ltr">
                      {lastAddress.address.phone}
                    </span>
                  ) : null}
                </address>
                <p className="mt-2 text-xs text-muted">
                  {format(t.fromOrder, { number: lastAddress.orderNumber })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">{t.noAddress}</p>
            )}
          </Panel>

          <Panel title={t.discountsUsed}>
            {redemptions.length === 0 ? (
              <p className="text-sm text-muted">{t.noneYet}</p>
            ) : (
              <ul className="space-y-2">
                {redemptions.map((redemption) => (
                  <li key={redemption.id} className="text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      {redemption.code ? (
                        <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs font-medium text-muted ring-1 ring-border ring-inset">
                          {redemption.code}
                        </code>
                      ) : (
                        <span className="text-xs text-muted">{t.automatic}</span>
                      )}
                      <span className="truncate">{redemption.title}</span>
                    </p>
                    <p className="text-xs text-muted tabular">
                      {format(t.orderOn, {
                        number: redemption.orderNumber,
                        date: formatDate(redemption.createdAt, locale),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </AdminPage>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
