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

export const ORDERS_PAGE_SIZE = 50;

/** One page of the store's orders, newest placed first. */
export async function listStoreOrders(
  storeId: string,
  { skip = 0, take = ORDERS_PAGE_SIZE }: { skip?: number; take?: number } = {},
) {
  return rootDb.order.findMany({
    where: { storeId },
    // The id breaks ties, so no order is skipped or shown twice across pages.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
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
      issues: true,
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

/** The drawer shows "99+" past this, so there is no point fetching more. */
export const UNSEEN_ORDERS_CAP = 100;

/**
 * Orders paid after `since` — a member's `ordersSeenAt` — for the count beside
 * Orders in the admin drawer. Settled statuses only, so an order that was paid
 * and has since been fulfilled still counts until it has been looked at.
 *
 * Ids rather than a count: the browser also hears about each payment over
 * Realtime, and an order it has already counted from here must not be counted
 * again when its announcement lands a moment later.
 */
export async function listUnseenOrderIds(storeId: string, since: Date): Promise<string[]> {
  const rows = await rootDb.order.findMany({
    where: {
      storeId,
      status: { in: [...SETTLED_ORDER_STATUSES] },
      paidAt: { gt: since },
    },
    orderBy: { paidAt: "desc" },
    take: UNSEEN_ORDERS_CAP,
    select: { id: true },
  });
  return rows.map((row) => row.id);
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
