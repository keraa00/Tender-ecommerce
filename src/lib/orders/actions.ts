"use server";

import * as z from "zod";

import { rootDb } from "@/lib/db/root";
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
