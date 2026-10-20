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
import { segmentLabel } from "@/lib/discounts/segments";
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
  const { detail } = await loadCustomer(storeSlug, customerEmailFromParam(email));
  return {
    title: detail
      ? `${detail.customer.name ?? detail.customer.email} · Customers`
      : "Customer",
  };
}

export default async function CustomerPage(
  props: PageProps<"/dashboard/[storeSlug]/customers/[email]">,
) {
  const { storeSlug, email } = await props.params;

  // `storeId` is part of every lookup, so an address that has only ever paid
  // another store 404s here — as does one that has only abandoned checkouts.
  const { store, detail } = await loadCustomer(storeSlug, customerEmailFromParam(email));
  if (!detail) notFound();

  const { customer, orders, redemptions, lastAddress } = detail;
  const segments = customerSegments(customer, new Date());
  const unsettled = orders.length - customer.orders;

  return (
    <AdminPage
      title={customer.name ?? customer.email}
      back={{ href: storeAdminPath(store.slug, "customers"), label: "Customers" }}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {customer.name ? <span>{customer.email}</span> : null}
          <Badge>{customer.hasAccount ? "Signed in" : "Guest"}</Badge>
        </span>
      }
    >
      <StatGrid>
        <Stat
          label="Total spent"
          value={formatMoney(customer.spentCents, store.currency)}
          hint="Paid and fulfilled orders"
        />
        <Stat
          label="Orders"
          value={String(customer.orders)}
          hint={
            unsettled > 0
              ? `Plus ${unsettled} unpaid or cancelled`
              : undefined
          }
        />
        <Stat
          label="Average order"
          value={formatMoney(Math.round(customer.spentCents / customer.orders), store.currency)}
        />
        <Stat
          label="Last order"
          value={formatDate(customer.lastOrderAt)}
          hint={
            customer.orders === 1
              ? "Their only order"
              : `First on ${formatDate(customer.firstOrderAt)}`
          }
        />
      </StatGrid>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <h2 className="text-lg font-medium tracking-tight">Orders</h2>
          <p className="mt-1 text-sm text-muted text-pretty">
            Everything placed with this email, in any status. Only paid and
            fulfilled orders count towards the totals above.
          </p>

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
                    {formatDate(order.createdAt)} · {order.itemCount}{" "}
                    {order.itemCount === 1 ? "item" : "items"}
                    {order.shippingRateName ? ` · ${order.shippingRateName}` : ""}
                  </Link>
                </div>

                <div className="shrink-0 text-right font-medium tabular">
                  {formatMoney(order.totalCents, order.currency)}
                </div>

                <div className="shrink-0">
                  <OrderStatusBadge status={order.status} />
                </div>
              </Row>
            ))}
          </Rows>
        </section>

        <aside className="space-y-4">
          <Panel title="Segments">
            {segments.length === 0 ? (
              <p className="text-sm text-muted">In no discount segment.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {segments.map((segment) => (
                  <li key={segment}>
                    <Badge>{segmentLabel(segment)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted text-pretty">
              As the discount form defines them, judged on their paid orders
              today.
            </p>
          </Panel>

          <Panel title="Shipping address">
            {lastAddress ? (
              <>
                <address className="text-sm not-italic">
                  {formatAddressLines(lastAddress.address, "en").map((line, index) => (
                    <span key={index} className="block">
                      {line}
                    </span>
                  ))}
                  {lastAddress.address.phone ? (
                    <span className="mt-1 block text-muted">{lastAddress.address.phone}</span>
                  ) : null}
                </address>
                <p className="mt-2 text-xs text-muted">
                  From order #{lastAddress.orderNumber}, their most recent delivery.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">No address on file.</p>
            )}
          </Panel>

          <Panel title="Discounts used">
            {redemptions.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
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
                        <span className="text-xs text-muted">Automatic</span>
                      )}
                      <span className="truncate">{redemption.title}</span>
                    </p>
                    <p className="text-xs text-muted tabular">
                      Order #{redemption.orderNumber} ·{" "}
                      {formatDate(redemption.createdAt)}
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
