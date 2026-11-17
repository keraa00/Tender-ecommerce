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
import { plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.orders.title} · ${store.name}` };
}

export default async function OrdersPage(
  props: PageProps<"/dashboard/[storeSlug]/orders">,
) {
  const { storeSlug } = await props.params;
  const { page: pageParam } = await props.searchParams;
  const [{ store, membership }, { t: messages, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.orders;
  const statuses = messages.badges.order;
  const number = new Intl.NumberFormat(intl);

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
      title={t.title}
      description={total === 0 ? t.empty : plural(locale, total, t.count)}
    >
      <NewOrdersNotice renderedAt={renderedAt.toISOString()} t={messages.liveOrders} />

      <StatGrid columns={showCod ? 5 : 4}>
        <Stat label={statuses.PENDING} value={number.format(counts.PENDING - codDue)} />
        {showCod ? (
          <Stat label={messages.badges.paymentOnDelivery} value={number.format(codDue)} />
        ) : null}
        <Stat label={statuses.PAID} value={number.format(counts.PAID)} />
        <Stat label={statuses.FULFILLED} value={number.format(counts.FULFILLED)} />
        <Stat label={statuses.CANCELLED} value={number.format(counts.CANCELLED)} />
      </StatGrid>

      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            action={
              canAcceptOrders(store) ? (
                <ButtonLink
                  href={storeAdminPath(store.slug, "products")}
                  variant="secondary"
                  size="sm"
                >
                  {t.reviewCatalogue}
                </ButtonLink>
              ) : (
                <ButtonLink href={storeAdminPath(store.slug, "settings/payments")} size="sm">
                  {t.setUpPayments}
                </ButtonLink>
              )
            }
          >
            {canAcceptOrders(store) ? t.emptyCanTake : t.emptyCannotTake}
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
                      className="absolute start-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent"
                    />
                  ) : null}
                  <div className="w-16 shrink-0 font-medium tabular">
                    #{order.orderNumber}
                    {isNew(order) ? <span className="sr-only"> {t.newOrder}</span> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate">{order.email}</p>
                    <p className="truncate text-sm text-muted tabular">
                      {formatDate(order.createdAt, locale)} ·{" "}
                      {plural(locale, order._count.lines, t.items)}
                      {order.shippingRateName ? ` · ${order.shippingRateName}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-end font-medium tabular">
                    {formatMoney(order.totalCents, order.currency, intl)}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {order.issues.length > 0 ? (
                      <Badge tone="warning">{t.needsAttention}</Badge>
                    ) : null}
                    {order.refundedCents > 0 ? (
                      <Badge>
                        {order.refundedCents >= order.totalCents ? t.refunded : t.partlyRefunded}
                      </Badge>
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
