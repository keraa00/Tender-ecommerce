import type { Metadata } from "next";
import Link from "next/link";

import {
  AdminPage,
  EmptyState,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { OrderStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath } from "@/lib/admin/links";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  countStoreOrdersByStatus,
  listStoreOrders,
} from "@/lib/orders/queries";
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
  const { store } = await getStoreContext(storeSlug);

  const [orders, counts] = await Promise.all([
    listStoreOrders(store.id),
    countStoreOrdersByStatus(store.id),
  ]);

  return (
    <AdminPage
      title="Orders"
      description={
        orders.length === 0
          ? "Every order placed with your store will appear here."
          : `${orders.length} most recent ${orders.length === 1 ? "order" : "orders"}.`
      }
    >
      <StatGrid>
        <Stat label="Awaiting payment" value={String(counts.PENDING)} />
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
              ? "Your store can take payments. Orders will show up here the moment a buyer checks out."
              : "Your store cannot take payments until Stripe onboarding is finished, so no order can be placed yet."}
          </EmptyState>
        ) : (
          <Rows>
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={storeAdminPath(store.slug, `orders/${order.id}`)}
                  className="flex items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="w-16 shrink-0 font-medium tabular">
                    #{order.orderNumber}
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

                  <div className="shrink-0">
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              </li>
            ))}
          </Rows>
        )}
      </div>
    </AdminPage>
  );
}
