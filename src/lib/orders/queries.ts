import "server-only";

import { rootDb } from "@/lib/db/root";
import { OrderStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";

/**
 * Seller-admin order reads. Like every other query module here, each function
 * takes `storeId` as its first argument and applies it as a filter; callers get
 * it from `getStoreContext()`, never from a request body.
 */

/**
 * Orders that represent money actually taken. PENDING is a checkout that was
 * started, and counting it as a sale is how a revenue figure ends up larger
 * than the bank balance behind it.
 */
export const SETTLED_ORDER_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
] as const;

export async function listStoreOrders(storeId: string, limit = 50) {
  return rootDb.order.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      email: true,
      status: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      paidAt: true,
      shippingRateName: true,
      _count: { select: { lines: true } },
    },
  });
}

export type StoreOrder = Awaited<ReturnType<typeof listStoreOrders>>[number];

/** Every status as a key, so the caller can render a full row of counters. */
export async function countStoreOrdersByStatus(
  storeId: string,
): Promise<Record<OrderStatus, number>> {
  const rows = await rootDb.order.groupBy({
    by: ["status"],
    where: { storeId },
    _count: { _all: true },
  });

  const counts = {
    [OrderStatus.PENDING]: 0,
    [OrderStatus.PAID]: 0,
    [OrderStatus.FULFILLED]: 0,
    [OrderStatus.CANCELLED]: 0,
  };

  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

/**
 * One order with everything it snapshotted, for its admin page. The id comes
 * from the URL, so it only ever narrows a lookup scoped to the store — another
 * store's order id finds nothing, and the page 404s.
 */
export async function getStoreOrder(storeId: string, orderId: string) {
  if (!isUuid(orderId)) return null;
  return rootDb.order.findFirst({
    where: { id: orderId, storeId },
    include: {
      lines: { orderBy: { id: "asc" } },
      user: { select: { id: true } },
    },
  });
}

export type StoreOrderDetail = NonNullable<Awaited<ReturnType<typeof getStoreOrder>>>;
