import "server-only";

import { timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";

import { rootDb } from "@/lib/db/root";
import { CartKind, OrderStatus, PaymentMethod, type Order, type Store } from "@/lib/db/types";
import { codSettingsOf } from "@/lib/payments/cod";
import { cancelPaymentIntent, retrievePaymentIntent } from "@/lib/payments/intents";
import { paymentOutcome, supersedeAction, type PaymentOutcome } from "@/lib/payments/rules";
import { cancelUnpaidOrder, markOrderPaid } from "@/lib/payments/settle";
import { stripeReady } from "@/lib/stores/policy";
import { isStripeConfigured } from "@/lib/stripe/server";
import { placedOrderId } from "./orders";
import type { PaymentOptions } from "./quote";

/**
 * Checkout's side of a payment: the ways this store can be paid, an earlier
 * attempt still open when the buyer places the order again, and what to tell
 * them on the confirmation page.
 */

/**
 * The ways a store can take payment right now. A card needs an account that
 * can be charged and a server with Stripe keys; cash on delivery only needs
 * switching on. Whether either fits a particular order is the quote's call.
 */
export function checkoutPaymentOptions(store: Store): Pick<PaymentOptions, "stripe" | "cod"> {
  return {
    stripe: stripeReady(store) && isStripeConfigured(),
    cod: store.codEnabled ? codSettingsOf(store) : null,
  };
}

export type SupersedeResult = "none" | "cancelled" | "paid" | "processing";

/**
 * Deals with this browser's previous, still-unpaid order in the store before
 * a new one is placed — the buyer reloaded checkout, or changed their address
 * after a declined card. Card orders only: a cash-on-delivery order is a
 * placed order, not an attempt, and a buyer starting another checkout must not
 * cancel it.
 *
 * Its money may already be in, in which case the buyer is done and must not
 * pay twice; or on its way (a bank debit), in which case it is left to finish.
 * Otherwise it is cancelled, PaymentIntent first and order second — never an
 * order cancelled under a payment that can still succeed — and its discount
 * uses go back before the new order redeems them, so a one-per-customer code
 * survives the retry.
 */
export async function supersedePlacedOrder(storeId: string): Promise<SupersedeResult> {
  const orderId = await placedOrderId();
  if (!orderId) return "none";

  const order = await rootDb.order.findFirst({
    where: { id: orderId, storeId, status: OrderStatus.PENDING, paymentMethod: PaymentMethod.STRIPE },
    select: { id: true, storeId: true, stripePaymentIntentId: true, stripeAccountId: true },
  });
  if (!order) return "none";

  return resolveUnpaidOrder(order);
}

export type UnpaidCardOrder = Pick<
  Order,
  "id" | "storeId" | "stripePaymentIntentId" | "stripeAccountId"
>;

/**
 * Brings one PENDING card order to an end: paid, if its money turns out to be
 * in; left alone while a payment is on its way; otherwise cancelled —
 * PaymentIntent first and order second, never an order cancelled under a
 * payment that can still succeed — with its discount uses given back.
 *
 * Shared by a buyer placing the order again (`supersedePlacedOrder`) and the
 * daily sweep of checkouts abandoned at the payment step.
 */
export async function resolveUnpaidOrder(
  order: UnpaidCardOrder,
): Promise<Exclude<SupersedeResult, "none">> {
  if (order.stripePaymentIntentId && order.stripeAccountId) {
    let intent = await retrievePaymentIntent(order.stripePaymentIntentId, order.stripeAccountId);
    if (supersedeAction(intent.status) === "cancel") {
      intent = await cancelPaymentIntent(intent.id, order.stripeAccountId);
    }

    switch (supersedeAction(intent.status)) {
      case "settle":
        await markOrderPaid(intent, order.stripeAccountId);
        return "paid";
      case "wait":
        return "processing";
      case "cancel":
        // Still cancellable after a cancel: Stripe disagreed; leave it alone.
        throw new Error(`PaymentIntent ${intent.id} could not be cancelled (${intent.status}).`);
      case "gone":
        break;
    }
  }

  await rootDb.$transaction((tx) => cancelUnpaidOrder(tx, order));
  return "cancelled";
}

type PlacedOrderPayment = Pick<
  Order,
  "id" | "storeId" | "status" | "paymentMethod" | "stripePaymentIntentId" | "stripeAccountId"
>;

/**
 * The order behind a return from Stripe, for when the cookie did not survive
 * the trip — a banking app that reopened the return URL in another browser.
 *
 * Stripe appends the PaymentIntent and its client secret to `return_url`. The
 * secret is only ever given to the browser that paid, so a match proves the
 * visitor is that buyer; the page still shows only the order number and where
 * the payment stands, never an address.
 */
export async function findOrderByPaymentReturn(
  storeId: string,
  intentId: unknown,
  clientSecret: unknown,
): Promise<(PlacedOrderPayment & { orderNumber: number }) | null> {
  if (typeof intentId !== "string" || typeof clientSecret !== "string") return null;
  if (!/^pi_[A-Za-z0-9]+$/.test(intentId)) return null;

  const order = await rootDb.order.findFirst({
    where: { storeId, stripePaymentIntentId: intentId },
    select: {
      id: true,
      storeId: true,
      status: true,
      paymentMethod: true,
      stripePaymentIntentId: true,
      stripeAccountId: true,
      orderNumber: true,
    },
  });
  if (!order?.stripeAccountId) return null;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await retrievePaymentIntent(intentId, order.stripeAccountId);
  } catch {
    return null;
  }

  const expected = Buffer.from(intent.client_secret ?? "");
  const given = Buffer.from(clientSecret);
  if (expected.length === 0 || expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? order : null;
}

/**
 * Where the remembered order's payment stands, settling it on the spot if
 * Stripe says it succeeded — so the confirmation page is right even when the
 * webhook is late, or not configured at all in development. A cash-on-delivery
 * order has nothing to ask Stripe: it is to be paid at the door.
 *
 * When Stripe cannot be reached, or the PaymentIntent does not match the
 * order, the answer is "processing": the money may well be in, and telling
 * the buyer to pay again would be the worse mistake.
 */
export async function syncPlacedOrderPayment(
  order: PlacedOrderPayment,
): Promise<{ outcome: PaymentOutcome; cartKind: CartKind }> {
  if (order.status !== OrderStatus.PENDING || !order.stripePaymentIntentId || !order.stripeAccountId) {
    return {
      outcome: paymentOutcome(order.status, null, order.paymentMethod),
      // A cancelled order offers "Try again", which has to go back to the
      // checkout it came from — and only the PaymentIntent remembers which.
      cartKind:
        order.status === OrderStatus.CANCELLED && order.stripePaymentIntentId && order.stripeAccountId
          ? await cartKindOfPayment(order.stripePaymentIntentId, order.stripeAccountId)
          : CartKind.STANDARD,
    };
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await retrievePaymentIntent(order.stripePaymentIntentId, order.stripeAccountId);
  } catch (error) {
    console.error("syncPlacedOrderPayment: could not read the PaymentIntent", error);
    return { outcome: "processing", cartKind: CartKind.STANDARD };
  }

  const cartKind = cartKindOf(intent);

  if (intent.status === "succeeded") {
    const result = await markOrderPaid(intent, order.stripeAccountId);
    return { outcome: result === "mismatch" ? "processing" : "paid", cartKind };
  }

  return { outcome: paymentOutcome(order.status, intent.status), cartKind };
}

/** Which cart the order was checked out from, as recorded on its PaymentIntent. */
function cartKindOf(intent: Stripe.PaymentIntent): CartKind {
  return intent.metadata?.cart_kind === CartKind.BUY_NOW ? CartKind.BUY_NOW : CartKind.STANDARD;
}

/** The same, for an order that is no longer pending. The everyday cart when Stripe cannot say. */
async function cartKindOfPayment(intentId: string, accountId: string): Promise<CartKind> {
  try {
    return cartKindOf(await retrievePaymentIntent(intentId, accountId));
  } catch {
    return CartKind.STANDARD;
  }
}
