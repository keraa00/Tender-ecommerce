import "server-only";

import type Stripe from "stripe";

import { rootDb } from "@/lib/db/root";
import { OrderIssue, OrderStatus, PaymentMethod, type Prisma } from "@/lib/db/types";
import { releaseDiscounts } from "@/lib/discounts/redemption";
import { isUuid } from "@/lib/ids";
import { ORDER_METADATA_KEY, paymentMismatch, refundOutcome, type RefundOutcome } from "./rules";

/**
 * Moving an order out of PENDING: paid, or cancelled before it was.
 *
 * Every move is a conditional update on the order's status — and its payment
 * method, so a Stripe path can never move a cash-on-delivery order or the
 * other way round — and everything that must happen exactly once — taking or
 * returning stock, emptying the cart, giving discount uses back — happens only
 * in the transaction whose update actually flipped the row. The webhook and
 * the confirmation page both settle orders, Stripe redelivers events, and a
 * seller can press a button twice; whichever gets there second finds the
 * order already moved and does nothing. That, not the `WebhookEvent` table, is
 * what makes a replay harmless.
 */

type Tx = Prisma.TransactionClient;
type OrderRef = { id: string; storeId: string };

/** Each variant's quantity on the order. Lines whose variant was deleted carry none. */
async function orderQuantities(tx: Tx, orderId: string): Promise<Map<string, number>> {
  const lines = await tx.orderLine.findMany({
    where: { orderId },
    select: { variantId: true, quantity: true },
  });
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.variantId) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }
  return quantities;
}

/**
 * Takes the order's quantities off stock, in a fixed lock order so two orders
 * sharing variants cannot deadlock. When a variant has fewer left than the
 * order needs, `short` decides: "zero" empties it and carries on (the money is
 * in, so the order stands), "fail" stops at once for the caller to roll back.
 */
async function takeStock(
  tx: Tx,
  order: OrderRef,
  short: "zero" | "fail",
): Promise<"taken" | "oversold" | "short"> {
  const quantities = await orderQuantities(tx, order.id);
  let oversold = false;
  for (const variantId of [...quantities.keys()].sort()) {
    const quantity = quantities.get(variantId)!;
    const taken = await tx.variant.updateMany({
      where: { id: variantId, storeId: order.storeId, inventoryQty: { gte: quantity } },
      data: { inventoryQty: { decrement: quantity } },
    });
    if (taken.count > 0) continue;
    if (short === "fail") return "short";

    await tx.variant.updateMany({
      where: { id: variantId, storeId: order.storeId },
      data: { inventoryQty: 0 },
    });
    oversold = true;
    console.warn(
      `Order ${order.id} oversold variant ${variantId}: fewer than ${quantity} were left when it was paid.`,
    );
  }
  return oversold ? "oversold" : "taken";
}

/** Only the cart that was checked out: "Buy it now" leaves the everyday cart as it was. */
async function emptyCart(tx: Tx, storeId: string, cartId: string | null): Promise<void> {
  if (cartId) await tx.cart.deleteMany({ where: { id: cartId, storeId } });
}

/**
 * PENDING → PAID, then take the stock and empty the cart the order came from.
 *
 * Stock is checked when the order is placed but only taken here, so an
 * abandoned checkout holds none. The price of that is that two buyers can pay
 * for the last unit; the second payment still stands — the money is in — so the
 * count goes to zero rather than below, and the order is marked OVERSOLD for
 * the seller to refund or restock.
 */
export async function settleOrder(
  tx: Tx,
  order: OrderRef,
  options: { cartId: string | null; paidAt: Date },
): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: {
      id: order.id,
      storeId: order.storeId,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
    },
    data: { status: OrderStatus.PAID, paidAt: options.paidAt },
  });
  if (count === 0) return false;

  // Only the call that flipped the order gets here, so this is raised once.
  if ((await takeStock(tx, order, "zero")) === "oversold") {
    await tx.order.update({
      where: { id: order.id },
      data: { issues: { push: OrderIssue.OVERSOLD } },
    });
  }

  await emptyCart(tx, order.storeId, options.cartId);
  return true;
}

/**
 * PENDING → CANCELLED, giving the order's discount uses back so an abandoned
 * payment does not burn a one-per-customer code. Stock was never taken. Stripe
 * orders only: a cash-on-delivery order has taken its stock, and is cancelled
 * by `cancelCodOrder`.
 */
export async function cancelUnpaidOrder(tx: Tx, order: OrderRef): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: {
      id: order.id,
      storeId: order.storeId,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
    },
    data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
  });
  if (count === 0) return false;

  await releaseDiscounts(tx, { storeId: order.storeId, orderId: order.id });
  return true;
}

// ---------------------------------------------------------------------------
// Cash on delivery
// ---------------------------------------------------------------------------

/** There were fewer left than a cash-on-delivery order asked for; nothing was taken. */
export class CodStockShort extends Error {}

/**
 * Takes a just-placed cash-on-delivery order's stock and empties its cart, in
 * the transaction that creates it. Unlike a card payment there is no money in
 * to honour, so running short is not an oversell: it throws `CodStockShort`
 * and the order is never placed.
 */
export async function confirmCodOrder(tx: Tx, order: OrderRef, cartId: string): Promise<void> {
  if ((await takeStock(tx, order, "fail")) === "short") throw new CodStockShort();
  await emptyCart(tx, order.storeId, cartId);
}

/** PENDING → PAID for a cash-on-delivery order: the seller has the cash. */
export async function markCodOrderPaid(tx: Tx, order: OrderRef): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: {
      id: order.id,
      storeId: order.storeId,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    },
    data: { status: OrderStatus.PAID, paidAt: new Date() },
  });
  return count > 0;
}

/**
 * PENDING → CANCELLED for a cash-on-delivery order — refused at the door,
 * never sent, or cancelled at the buyer's request. Its stock goes back, in the
 * same lock order it was taken in, and its discount uses are released.
 */
export async function cancelCodOrder(tx: Tx, order: OrderRef): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: {
      id: order.id,
      storeId: order.storeId,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    },
    data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
  });
  if (count === 0) return false;

  await restockOrder(tx, order);
  await releaseDiscounts(tx, { storeId: order.storeId, orderId: order.id });
  return true;
}

/**
 * Puts an order's units back into stock, in a fixed variant order so two
 * restocks never lock rows against each other. The caller has just made the
 * one conditional move that entitles it to — a restock is never repeated.
 */
async function restockOrder(tx: Tx, order: OrderRef): Promise<void> {
  const quantities = await orderQuantities(tx, order.id);
  for (const variantId of [...quantities.keys()].sort()) {
    await tx.variant.updateMany({
      where: { id: variantId, storeId: order.storeId },
      data: { inventoryQty: { increment: quantities.get(variantId)! } },
    });
  }
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * PAID → FULFILLED: the seller has sent it, or handed it over. Only a paid
 * order — a card order whose money is in, or a cash-on-delivery order marked
 * paid — so nothing is shipped against a payment that may still fail.
 * Conditional like every move here: a second click moves nothing.
 */
export async function fulfillOrder(tx: Tx, order: OrderRef): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: order.id, storeId: order.storeId, status: OrderStatus.PAID },
    data: { status: OrderStatus.FULFILLED, fulfilledAt: new Date() },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// Refunds and disputes
// ---------------------------------------------------------------------------

/**
 * The card order a charge or dispute belongs to, by its PaymentIntent — set on
 * the order long before anything can be refunded or disputed — and only on the
 * connected account that order was charged on. A payment the seller took
 * outside Tender matches no order and is ignored.
 */
export async function findOrderForPaymentIntentId(
  paymentIntentId: string,
  accountId: string,
): Promise<OrderRef | null> {
  return rootDb.order.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      stripeAccountId: accountId,
      paymentMethod: PaymentMethod.STRIPE,
    },
    select: { id: true, storeId: true },
  });
}

/**
 * Brings a refund made in the seller's Stripe Dashboard onto the order, with
 * `amountRefundedCents` the charge's refunded total so far (see
 * `refundOutcome`). The move is conditional on the recorded total still being
 * below the new one, so of two deliveries only one gets through — and only that
 * one restocks a fully refunded order that was never sent.
 *
 * An order that was OVERSOLD is not restocked: its stock was set to zero when
 * it was paid rather than reduced by its quantities, so putting those back
 * would invent units. Its seller restocks by hand.
 *
 * A full refund of an order paid after it was cancelled settles that issue.
 * Discount uses are not given back: the code was used.
 */
export async function recordRefund(
  tx: Tx,
  order: OrderRef,
  amountRefundedCents: number,
): Promise<RefundOutcome> {
  const current = await tx.order.findFirst({
    where: { id: order.id, storeId: order.storeId },
    select: { status: true, totalCents: true, refundedCents: true, issues: true },
  });
  if (!current) return "none";

  const outcome = refundOutcome(current, amountRefundedCents);
  if (outcome === "none") return outcome;

  const refundedCents = Math.min(amountRefundedCents, current.totalCents);
  const now = new Date();
  const fullRefund = refundedCents >= current.totalCents;

  const { count } = await tx.order.updateMany({
    where: {
      id: order.id,
      storeId: order.storeId,
      refundedCents: { lt: refundedCents },
      ...(outcome === "cancel" ? { status: OrderStatus.PAID } : {}),
    },
    data: {
      refundedCents,
      refundedAt: now,
      ...(outcome === "cancel" ? { status: OrderStatus.CANCELLED, cancelledAt: now } : {}),
      ...(fullRefund && current.issues.includes(OrderIssue.PAID_AFTER_CANCEL)
        ? { issues: current.issues.filter((issue) => issue !== OrderIssue.PAID_AFTER_CANCEL) }
        : {}),
    },
  });
  if (count === 0) return "none";

  if (outcome === "cancel" && !current.issues.includes(OrderIssue.OVERSOLD)) {
    await restockOrder(tx, order);
  }
  return outcome;
}

/**
 * Raises or clears the order's DISPUTED flag: raised when the buyer's bank
 * opens a dispute, cleared when Stripe closes it in the seller's favour. Both
 * are conditional on the flag's current state, so redeliveries do nothing.
 */
export async function setOrderDisputed(tx: Tx, order: OrderRef, disputed: boolean): Promise<boolean> {
  if (disputed) {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, storeId: order.storeId, NOT: { issues: { has: OrderIssue.DISPUTED } } },
      data: { issues: { push: OrderIssue.DISPUTED } },
    });
    return count > 0;
  }

  const current = await tx.order.findFirst({
    where: { id: order.id, storeId: order.storeId, issues: { has: OrderIssue.DISPUTED } },
    select: { issues: true },
  });
  if (!current) return false;

  const { count } = await tx.order.updateMany({
    where: { id: order.id, storeId: order.storeId, issues: { has: OrderIssue.DISPUTED } },
    data: { issues: current.issues.filter((issue) => issue !== OrderIssue.DISPUTED) },
  });
  return count > 0;
}

/**
 * The order a PaymentIntent was created for: by PaymentIntent id, or by the
 * order id in its metadata for the moment between Stripe creating the
 * PaymentIntent and the order row learning its id. A PaymentIntent with
 * neither is one of the seller's own payments outside Tender — Connect
 * delivers those too — and finds nothing.
 */
export async function findOrderForIntent(intent: Stripe.PaymentIntent) {
  const metadataOrderId = intent.metadata?.[ORDER_METADATA_KEY];
  return rootDb.order.findFirst({
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
}

export type MarkPaidResult = "settled" | "already" | "ignored" | "mismatch";

/** Settles the order a succeeded PaymentIntent paid for. */
export async function markOrderPaid(
  intent: Stripe.PaymentIntent,
  accountId: string | null,
): Promise<MarkPaidResult> {
  if (intent.status !== "succeeded") return "ignored";

  const order = await findOrderForIntent(intent);
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
    // should not happen; if it does, the buyer has paid for nothing. The seller
    // is told on the order — once, however often Stripe redelivers.
    console.error(`PaymentIntent ${intent.id} succeeded for cancelled order ${order.id}: refund it.`);
    await rootDb.order.updateMany({
      where: {
        id: order.id,
        status: OrderStatus.CANCELLED,
        NOT: { issues: { has: OrderIssue.PAID_AFTER_CANCEL } },
      },
      data: {
        issues: { push: OrderIssue.PAID_AFTER_CANCEL },
        // Found by its metadata: keep the payment it was paid by.
        ...(order.stripePaymentIntentId ? {} : { stripePaymentIntentId: intent.id }),
      },
    });
  }

  return settled ? "settled" : "already";
}
