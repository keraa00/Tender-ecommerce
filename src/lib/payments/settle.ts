import "server-only";

import type Stripe from "stripe";

import { rootDb } from "@/lib/db/root";
import { OrderStatus, type Prisma } from "@/lib/db/types";
import { releaseDiscounts } from "@/lib/discounts/redemption";
import { isUuid } from "@/lib/ids";
import { ORDER_METADATA_KEY, paymentMismatch } from "./rules";

/**
 * Moving an order out of PENDING: paid, or cancelled before it was.
 *
 * Both moves are a conditional update on the order's status, and everything
 * that must happen exactly once — taking stock, emptying the cart, giving
 * discount uses back — happens only in the transaction whose update actually
 * flipped the row. The webhook and the confirmation page both settle orders,
 * and Stripe redelivers events; whichever gets there second finds the order
 * already moved and does nothing. That, not the `WebhookEvent` table, is what
 * makes a replay harmless.
 */

type Tx = Prisma.TransactionClient;
type OrderRef = { id: string; storeId: string };

/**
 * PENDING → PAID, then take the stock and empty the cart the order came from.
 *
 * Stock is checked when the order is placed but only taken here, so an
 * abandoned checkout holds none. The price of that is that two buyers can pay
 * for the last unit; the second payment still stands — the money is in — so the
 * count goes to zero rather than below, and the oversell is logged for the
 * seller to refund.
 */
export async function settleOrder(
  tx: Tx,
  order: OrderRef,
  options: { cartId: string | null; paidAt: Date },
): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: order.id, storeId: order.storeId, status: OrderStatus.PENDING },
    data: { status: OrderStatus.PAID, paidAt: options.paidAt },
  });
  if (count === 0) return false;

  const lines = await tx.orderLine.findMany({
    where: { orderId: order.id },
    select: { variantId: true, quantity: true },
  });
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.variantId) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }

  // A fixed lock order, so two orders sharing variants cannot deadlock.
  for (const variantId of [...quantities.keys()].sort()) {
    const quantity = quantities.get(variantId)!;
    const taken = await tx.variant.updateMany({
      where: { id: variantId, storeId: order.storeId, inventoryQty: { gte: quantity } },
      data: { inventoryQty: { decrement: quantity } },
    });
    if (taken.count === 0) {
      await tx.variant.updateMany({
        where: { id: variantId, storeId: order.storeId },
        data: { inventoryQty: 0 },
      });
      console.warn(
        `Order ${order.id} oversold variant ${variantId}: fewer than ${quantity} were left when it was paid.`,
      );
    }
  }

  // Only the cart that was checked out: "Buy it now" leaves the buyer's
  // everyday cart as it was.
  if (options.cartId) {
    await tx.cart.deleteMany({ where: { id: options.cartId, storeId: order.storeId } });
  }

  return true;
}

/**
 * PENDING → CANCELLED, giving the order's discount uses back so an abandoned
 * payment does not burn a one-per-customer code. Stock was never taken.
 */
export async function cancelUnpaidOrder(tx: Tx, order: OrderRef): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: order.id, storeId: order.storeId, status: OrderStatus.PENDING },
    data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
  });
  if (count === 0) return false;

  await releaseDiscounts(tx, { storeId: order.storeId, orderId: order.id });
  return true;
}

export type MarkPaidResult = "settled" | "already" | "ignored" | "mismatch";

/**
 * Settles the order a succeeded PaymentIntent paid for.
 *
 * Found by PaymentIntent id, or by the order id in its metadata for the
 * moment between Stripe creating the PaymentIntent and the order row learning
 * its id. A PaymentIntent with neither is one of the seller's own payments
 * outside Tender — Connect delivers those too — and is ignored.
 */
export async function markOrderPaid(
  intent: Stripe.PaymentIntent,
  accountId: string | null,
): Promise<MarkPaidResult> {
  if (intent.status !== "succeeded") return "ignored";

  const metadataOrderId = intent.metadata?.[ORDER_METADATA_KEY];
  const order = await rootDb.order.findFirst({
    where: {
      OR: [
        { stripePaymentIntentId: intent.id },
        ...(isUuid(metadataOrderId) ? [{ id: metadataOrderId, stripePaymentIntentId: null }] : []),
      ],
    },
    select: {
      id: true,
      storeId: true,
      status: true,
      totalCents: true,
      currency: true,
      stripeAccountId: true,
      stripePaymentIntentId: true,
    },
  });
  if (!order) return "ignored";

  const mismatch = paymentMismatch(order, intent, accountId);
  if (mismatch) {
    console.error(
      `PaymentIntent ${intent.id} does not match order ${order.id} (${mismatch}); leaving it unpaid.`,
    );
    return "mismatch";
  }

  const metadataCartId = intent.metadata?.cart_id;
  const cartId = isUuid(metadataCartId) ? metadataCartId : null;
  const settled = await rootDb.$transaction(async (tx) => {
    if (!order.stripePaymentIntentId) {
      await tx.order.updateMany({
        where: { id: order.id, stripePaymentIntentId: null },
        data: { stripePaymentIntentId: intent.id },
      });
    }
    return settleOrder(tx, order, { cartId, paidAt: new Date() });
  });

  if (!settled && order.status === OrderStatus.CANCELLED) {
    // Cancelling the PaymentIntent comes before cancelling the order, so this
    // should not happen; if it does, the buyer has paid for nothing.
    console.error(`PaymentIntent ${intent.id} succeeded for cancelled order ${order.id}: refund it.`);
  }

  return settled ? "settled" : "already";
}
