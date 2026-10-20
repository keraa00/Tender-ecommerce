import "server-only";

import type Stripe from "stripe";

import type { CartKind, Order } from "@/lib/db/types";
import { getStripe } from "@/lib/stripe/server";
import { orderPaymentIntentParams } from "./rules";

/**
 * The Stripe calls behind an order's payment. Every one is made as the seller's
 * connected account: charges are direct, so the PaymentIntent lives there.
 */

export type CreateIntentResult =
  | { ok: true; id: string; clientSecret: string }
  | { ok: false; error: "payment-unavailable" | "below-minimum" };

export async function createOrderPaymentIntent(
  order: Pick<
    Order,
    "id" | "storeId" | "orderNumber" | "email" | "currency" | "totalCents" | "platformFeeCents"
  >,
  store: { name: string; stripeAccountId: string },
  cart: { id: string; kind: CartKind },
): Promise<CreateIntentResult> {
  const { params, idempotencyKey } = orderPaymentIntentParams(order, store, cart);

  try {
    const intent = await getStripe().paymentIntents.create(params, {
      stripeContext: store.stripeAccountId,
      idempotencyKey,
    });
    if (!intent.client_secret) return { ok: false, error: "payment-unavailable" };
    return { ok: true, id: intent.id, clientSecret: intent.client_secret };
  } catch (error) {
    // Stripe's minimum charge depends on the currency the seller settles in,
    // so it is Stripe's answer rather than a table kept here.
    if ((error as { code?: unknown }).code === "amount_too_small") {
      return { ok: false, error: "below-minimum" };
    }
    console.error("createOrderPaymentIntent failed", error);
    return { ok: false, error: "payment-unavailable" };
  }
}

export function retrievePaymentIntent(intentId: string, accountId: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.retrieve(intentId, undefined, { stripeContext: accountId });
}

/**
 * Cancels an unpaid PaymentIntent. Returns the PaymentIntent as it now stands:
 * cancelling one that has meanwhile succeeded or started processing fails, and
 * the caller needs to know which happened.
 */
export async function cancelPaymentIntent(
  intentId: string,
  accountId: string,
): Promise<Stripe.PaymentIntent> {
  try {
    return await getStripe().paymentIntents.cancel(intentId, undefined, { stripeContext: accountId });
  } catch (error) {
    const current = await retrievePaymentIntent(intentId, accountId);
    if (current.status === "canceled") return current;
    if (current.status === "succeeded" || current.status === "processing") return current;
    throw error;
  }
}
