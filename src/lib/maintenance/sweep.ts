import "server-only";

import { resolveUnpaidOrder } from "@/lib/checkout/payment";
import { rootDb } from "@/lib/db/root";
import { OrderStatus, PaymentMethod } from "@/lib/db/types";
import { UNPAID_ORDERS_PER_RUN, sweepCutoffs } from "./rules";

export type SweepResult = {
  unpaidOrders: { cancelled: number; paid: number; processing: number; failed: number };
  deleted: { carts: number; savedCheckouts: number; themePreviews: number; webhookEvents: number };
};

/**
 * Clears what anonymous visitors leave behind (SECURITY_AUDIT.md TND-02,
 * TND-09), once a day from Vercel Cron.
 *
 * - **Card checkouts abandoned at the payment step** are resolved exactly as a
 *   buyer retrying would resolve them (`resolveUnpaidOrder`): cancelled, with
 *   their discount uses given back — or paid, if the money did come in. Cash
 *   on delivery orders are placed orders and are the seller's to settle.
 * - **Carts, saved checkouts, editor previews and webhook records** past their
 *   cut-off are deleted; nothing can reach them any more.
 *
 * Platform-wide by nature, hence `rootDb`. One order failing — Stripe down,
 * an account disconnected — is counted and left for tomorrow, and never stops
 * the rest.
 */
export async function runSweep(now: Date): Promise<SweepResult> {
  const cutoffs = sweepCutoffs(now);

  const stale = await rootDb.order.findMany({
    where: {
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
      createdAt: { lt: cutoffs.unpaidOrders },
    },
    orderBy: { createdAt: "asc" },
    take: UNPAID_ORDERS_PER_RUN,
    select: { id: true, storeId: true, stripePaymentIntentId: true, stripeAccountId: true },
  });

  const unpaidOrders = { cancelled: 0, paid: 0, processing: 0, failed: 0 };
  for (const order of stale) {
    try {
      unpaidOrders[await resolveUnpaidOrder(order)] += 1;
    } catch (error) {
      unpaidOrders.failed += 1;
      console.error(`sweep: could not resolve unpaid order ${order.id}`, error);
    }
  }

  const [carts, savedCheckouts, themePreviews, webhookEvents] = await Promise.all([
    rootDb.cart.deleteMany({ where: { updatedAt: { lt: cutoffs.carts } } }),
    rootDb.savedCheckout.deleteMany({ where: { updatedAt: { lt: cutoffs.savedCheckouts } } }),
    rootDb.themePreview.deleteMany({ where: { updatedAt: { lt: cutoffs.themePreviews } } }),
    rootDb.webhookEvent.deleteMany({ where: { processedAt: { lt: cutoffs.webhookEvents } } }),
  ]);

  return {
    unpaidOrders,
    deleted: {
      carts: carts.count,
      savedCheckouts: savedCheckouts.count,
      themePreviews: themePreviews.count,
      webhookEvents: webhookEvents.count,
    },
  };
}
