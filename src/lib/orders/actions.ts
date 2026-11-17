"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { rootDb } from "@/lib/db/root";
import { getAdminI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/ids";
import { cancelCodOrder, fulfillOrder, markCodOrderPaid } from "@/lib/payments/settle";
import { getStoreContext } from "@/lib/stores/context";
import type { UnseenOrders } from "./live";
import { listUnseenOrderIds } from "./queries";

const renderedAtSchema = z.iso.datetime();

/**
 * The orders list rendered at `renderedAt` has been on the member's screen, so
 * everything paid up to then is seen. The page's own render time, not "now":
 * an order paid between that render and this call is not on the screen yet and
 * stays new. The marker only moves forward — a stale tab reporting an older
 * render changes nothing — and never past the present.
 */
export async function markOrdersSeenAction(
  storeSlug: string,
  renderedAt: string,
): Promise<UnseenOrders> {
  const { store, membership } = await getStoreContext(storeSlug);

  let seenThrough = membership.ordersSeenAt;
  const parsed = renderedAtSchema.safeParse(renderedAt);
  if (parsed.success) {
    const at = new Date(Math.min(Date.parse(parsed.data), Date.now()));
    if (at > seenThrough) {
      await rootDb.storeMember.updateMany({
        where: { id: membership.id, ordersSeenAt: { lt: at } },
        data: { ordersSeenAt: at },
      });
      seenThrough = at;
    }
  }

  return {
    ids: await listUnseenOrderIds(store.id, seenThrough),
    seenThroughMs: seenThrough.getTime(),
  };
}

/** The count from the database, for when Realtime may have missed something. */
export async function getUnseenOrdersAction(storeSlug: string): Promise<UnseenOrders> {
  const { store, membership } = await getStoreContext(storeSlug);

  return {
    ids: await listUnseenOrderIds(store.id, membership.ordersSeenAt),
    seenThroughMs: membership.ordersSeenAt.getTime(),
  };
}

export type OrderActionResult = { ok: true } | { ok: false; error: string };

/**
 * Moves one of the store's orders on: a cash-on-delivery order paid, once the
 * courier has handed over the cash, or cancelled — refused at the door, never
 * sent — with its stock put back and its discount uses released; or a paid
 * order fulfilled.
 *
 * The order id comes from the browser, so it only narrows a lookup scoped to
 * the member's store; another store's order moves nothing. Every move is
 * conditional on the order still being where it started, so a double click or
 * a second tab does nothing the second time, and says why.
 */
async function moveOrder(
  storeSlug: string,
  orderId: string,
  move: typeof fulfillOrder,
  stale: "notAwaitingCash" | "notPaid",
): Promise<OrderActionResult> {
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  if (!isUuid(orderId)) return { ok: false, error: t.orders.errors.notFound };

  let moved: boolean;
  try {
    moved = await rootDb.$transaction((tx) => move(tx, { id: orderId, storeId: store.id }));
  } catch (error) {
    console.error("moveOrder failed", error);
    return { ok: false, error: t.orders.errors.failed };
  }

  // The order, the list, the overview's totals and the customer pages all
  // read it.
  revalidatePath(`/dashboard/${storeSlug}`, "layout");
  return moved ? { ok: true } : { ok: false, error: t.orders.errors[stale] };
}

export async function markCodOrderPaidAction(
  storeSlug: string,
  orderId: string,
): Promise<OrderActionResult> {
  return moveOrder(storeSlug, orderId, markCodOrderPaid, "notAwaitingCash");
}

export async function cancelCodOrderAction(
  storeSlug: string,
  orderId: string,
): Promise<OrderActionResult> {
  return moveOrder(storeSlug, orderId, cancelCodOrder, "notAwaitingCash");
}

export async function fulfillOrderAction(
  storeSlug: string,
  orderId: string,
): Promise<OrderActionResult> {
  return moveOrder(storeSlug, orderId, fulfillOrder, "notPaid");
}
