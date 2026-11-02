/**
 * The seller admin's live count of new orders: the number beside Orders in the
 * drawer and the "new orders" notice on the orders list.
 *
 * Two sources feed it. The database is the truth — paid orders after the
 * member's `ordersSeenAt` — and is read on page loads and whenever the
 * Realtime connection (re)joins. In between, the `order_paid` broadcasts sent by
 * the `private.broadcast_order_paid()` trigger move it forward without a round
 * trip. Both are keyed by order id, so an order the two report at once is still
 * one order.
 *
 * Shared by the browser and the tests, so nothing here may import Prisma.
 */

/**
 * When an order became news to the seller, or null if it never did: a
 * cash-on-delivery order when it was placed — there is a parcel to send — and
 * any other when it was paid. The trigger announces on the same rule, and
 * `listUnseenOrderIds` counts on it.
 */
export function orderArrivedAt(order: {
  paymentMethod: "STRIPE" | "CASH_ON_DELIVERY";
  status: "PENDING" | "PAID" | "FULFILLED" | "CANCELLED";
  createdAt: Date;
  paidAt: Date | null;
}): Date | null {
  if (order.paymentMethod === "CASH_ON_DELIVERY") {
    return order.status === "CANCELLED" ? null : order.createdAt;
  }
  return order.paidAt;
}

/** Must match the event the `private.broadcast_order_paid()` trigger sends. */
export const ORDER_PAID_EVENT = "order_paid";

/** Must match the topic the trigger sends to, and the shape its policy accepts. */
export function storeOrdersTopic(storeId: string): string {
  return `store:${storeId}:orders`;
}

export type OrderPaidPayload = {
  id: string;
  orderNumber: number;
  /**
   * Epoch milliseconds: when the order arrived — paid, or placed for cash on
   * delivery (see `orderArrivedAt`). Null only if the row was marked paid
   * without a time.
   */
  paidAtMs: number | null;
};

/** Broadcast payloads arrive as untyped JSON; anything malformed is ignored. */
export function readOrderPaidPayload(value: unknown): OrderPaidPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, orderNumber, paidAtMs } = value as Record<string, unknown>;
  if (typeof id !== "string" || typeof orderNumber !== "number") return null;
  return {
    id,
    orderNumber,
    paidAtMs: typeof paidAtMs === "number" && Number.isFinite(paidAtMs) ? paidAtMs : null,
  };
}

/** What the server reports: the unseen orders, and what "seen" runs up to. */
export type UnseenOrders = {
  ids: readonly string[];
  seenThroughMs: number;
};

export type NewOrdersState = {
  ids: ReadonlySet<string>;
  seenThroughMs: number;
};

export type NewOrdersAction =
  | { type: "received"; order: OrderPaidPayload }
  | { type: "synced"; unseen: UnseenOrders };

export function toNewOrdersState(unseen: UnseenOrders): NewOrdersState {
  return { ids: new Set(unseen.ids), seenThroughMs: unseen.seenThroughMs };
}

export function newOrdersReducer(
  state: NewOrdersState,
  action: NewOrdersAction,
): NewOrdersState {
  switch (action.type) {
    case "received": {
      const { id, paidAtMs } = action.order;
      // Already counted, or paid before the member last looked — an
      // announcement that arrived late for an order already on their screen.
      if (state.ids.has(id)) return state;
      if (paidAtMs !== null && paidAtMs <= state.seenThroughMs) return state;
      return { ...state, ids: new Set(state.ids).add(id) };
    }
    case "synced":
      return toNewOrdersState(action.unseen);
  }
}

/** The drawer's label: a count, capped so it never outgrows the pill. */
export function formatNewOrderCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function describeNewOrders(count: number): string {
  if (count > 99) return "99+ new orders";
  return count === 1 ? "1 new order" : `${count} new orders`;
}
