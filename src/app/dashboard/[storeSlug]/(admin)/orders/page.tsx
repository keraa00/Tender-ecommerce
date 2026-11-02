import type { Metadata } from "next";
import Link from "next/link";

import { NewOrdersNotice } from "@/components/admin/new-orders";
import {
  AdminPage,
  EmptyState,
  Pager,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath } from "@/lib/admin/links";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { orderArrivedAt } from "@/lib/orders/live";
import {
  countStoreOrdersByStatus,
  listStoreOrders,
  ORDERS_PAGE_SIZE,
} from "@/lib/orders/queries";
import { pageWindow, parsePage } from "@/lib/pagination";
import { getStoreContext } from "@/lib/stores/context";
import { canAcceptOrders } from "@/lib/stores/policy";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/orders">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Orders · ${store.name}` };
}

export default async function OrdersPage(
  props: PageProps<"/dashboard/[storeSlug]/orders">,
) {
  const { storeSlug } = await props.params;
  const { page: pageParam } = await props.searchParams;
  const { store, membership } = await getStoreContext(storeSlug);

  // `NewOrdersNotice` marks orders seen up to this moment. Taken before the
  // reads, so everything it covers had been paid by the time the list was read
  // and is on this render; at worst an order paid during the reads is both
  // listed and counted as new once more.
  const renderedAt = new Date();
  // The counts come first: their sum is the total that says which pages exist.
  const { byStatus: counts, codDue } = await countStoreOrdersByStatus(store.id);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const page = pageWindow(total, parsePage(pageParam), ORDERS_PAGE_SIZE);
  const orders = await listStoreOrders(store.id, { skip: page.skip, take: page.take });
  const showCod = codDue > 0 || store.codEnabled;
  const listPath = storeAdminPath(store.slug, "orders");
  const pageHref = (number: number) => (number === 1 ? listPath : `${listPath}?page=${number}`);

  // Arrived since this member last opened the list — paid, or placed for cash
  // on delivery. The list is newest-placed first, and a card order can be paid
  // a while after it was placed, so this is how they find what the drawer's
  // count was about.
  const seenAt = membership.ordersSeenAt;
  const isNew = (order: (typeof orders)[number]) => {
    const arrivedAt = orderArrivedAt(order);
    return arrivedAt !== null && arrivedAt > seenAt;
  };

  return (
    <AdminPage
      title="Orders"
      description={
        total === 0
          ? "Every order placed with your store will appear here."
          : `${total} ${total === 1 ? "order" : "orders"}, newest first.`
      }
    >
      <NewOrdersNotice renderedAt={renderedAt.toISOString()} />

      <StatGrid columns={showCod ? 5 : 4}>
        <Stat label="Awaiting payment" value={String(counts.PENDING - codDue)} />
        {showCod ? <Stat label="Payment on delivery" value={String(codDue)} /> : null}
        <Stat label="Paid" value={String(counts.PAID)} />
        <Stat label="Fulfilled" value={String(counts.FULFILLED)} />
        <Stat label="Cancelled" value={String(counts.CANCELLED)} />
      </StatGrid>

      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            action={
              canAcceptOrders(store) ? (
                <ButtonLink
                  href={storeAdminPath(store.slug, "products")}
                  variant="secondary"
                  size="sm"
                >
                  Review your catalogue
                </ButtonLink>
              ) : (
                <ButtonLink href={storeAdminPath(store.slug, "settings/payments")} size="sm">
                  Set up payments
                </ButtonLink>
              )
            }
          >
            {canAcceptOrders(store)
              ? "Your store can take orders. They will show up here the moment a buyer checks out."
              : "Your store cannot take orders until you finish Stripe onboarding or turn on cash on delivery, so no order can be placed yet."}
          </EmptyState>
        ) : (
          <Rows>
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={storeAdminPath(store.slug, `orders/${order.id}`)}
                  className={cn(
                    "relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover",
                    isNew(order) ? "bg-accent/5" : "bg-surface",
                  )}
                >
                  {isNew(order) ? (
                    <span
                      aria-hidden
                      className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent"
                    />
                  ) : null}
                  <div className="w-16 shrink-0 font-medium tabular">
                    #{order.orderNumber}
                    {isNew(order) ? <span className="sr-only"> (new)</span> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate">{order.email}</p>
                    <p className="truncate text-sm text-muted tabular">
                      {formatDate(order.createdAt)} · {order._count.lines}{" "}
                      {order._count.lines === 1 ? "item" : "items"}
                      {order.shippingRateName ? ` · ${order.shippingRateName}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right font-medium tabular">
                    {formatMoney(order.totalCents, order.currency)}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {order.issues.length > 0 ? (
                      <Badge tone="warning">Needs attention</Badge>
                    ) : null}
                    <OrderStatusBadge status={order.status} paymentMethod={order.paymentMethod} />
                  </div>
                </Link>
              </li>
            ))}
          </Rows>
        )}

        {page.pageCount > 1 ? (
          <div className="mt-4">
            <Pager
              from={page.from}
              to={page.to}
              total={page.total}
              prevHref={page.page > 1 ? pageHref(page.page - 1) : null}
              nextHref={page.page < page.pageCount ? pageHref(page.page + 1) : null}
            />
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}
