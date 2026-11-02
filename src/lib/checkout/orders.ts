import "server-only";

import { cookies } from "next/headers";

import { getCart } from "@/lib/cart/queries";
import { rootDb } from "@/lib/db/root";
import { OrderStatus, Prisma, ProductStatus, type CartKind } from "@/lib/db/types";
import { DiscountRedemptionError, redeemDiscounts } from "@/lib/discounts/redemption";
import { isUuid } from "@/lib/ids";
import { paymentMethodOf } from "@/lib/payments/cod";
import { createOrderPaymentIntent } from "@/lib/payments/intents";
import {
  cancelUnpaidOrder,
  CodStockShort,
  confirmCodOrder,
  settleOrder,
} from "@/lib/payments/settle";
import type { CheckoutDetails } from "./form";
import { priceCheckout } from "./pricing";
import type { PaymentOptions } from "./quote";
import {
  appliedDiscountsSnapshot,
  orderAmounts,
  primaryDiscountId,
  toPricedLines,
} from "./totals";

/**
 * Turning a cart into an order, and the order into a PaymentIntent.
 *
 * The order is created Unpaid (PENDING) with its discounts redeemed, then a
 * PaymentIntent for its total is created on the seller's Stripe account and
 * its client secret handed back for the Payment Element to confirm. The order
 * becomes PAID — stock taken, cart emptied — in `settleOrder`, when the
 * payment succeeds. So an abandoned payment holds no stock, and the cart is
 * still there for the buyer to try again.
 *
 * An order that comes to nothing (a 100% discount with free delivery) has no
 * payment to take and settles in the transaction that creates it.
 *
 * A cash-on-delivery order has no payment to wait for either: it takes its
 * stock and empties its cart in the transaction that creates it, and stays
 * PENDING until the seller marks the cash received.
 */

export type PlaceOrderError =
  | "empty"
  | "stock-changed"
  | "total-changed"
  | "discount-unavailable"
  /** The store does not deliver to the address, or no rate fits the order. */
  | "shipping-unavailable"
  /** The rate the buyer picked no longer applies, or its price moved. */
  | "shipping-changed"
  /** The way the buyer chose to pay is not open to this order any more. */
  | "payment-method-changed"
  /** Stripe could not create the payment. The order was cancelled. */
  | "payment-unavailable"
  /** The total is under Stripe's minimum charge for the currency. */
  | "below-minimum"
  | "failed";

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: number;
      /** For the Payment Element to confirm; null when there was nothing to pay. */
      clientSecret: string | null;
    }
  | { ok: false; error: PlaceOrderError; totalCents?: number };

class StockChanged extends Error {}
class ShippingChanged extends Error {}

export async function placeOrder(input: {
  store: {
    id: string;
    name: string;
    commissionBps: number;
    stripeAccountId: string | null;
    currency: string;
  };
  /** What the store can take payment with; the buyer's pick is in `details`. */
  payment: Pick<PaymentOptions, "stripe" | "cod">;
  sessionId: string;
  /** Which of this browser's carts is being checked out. */
  kind: CartKind;
  buyer: { email: string; userId: string | null };
  details: CheckoutDetails;
}): Promise<PlaceOrderResult> {
  const { store, buyer, details } = input;

  const cartRow = await rootDb.cart.findUnique({
    where: {
      storeId_sessionId_kind: { storeId: store.id, sessionId: input.sessionId, kind: input.kind },
    },
    select: { id: true, email: true },
  });
  if (!cartRow) return { ok: false, error: "empty" };

  // Keep the email on the cart whatever happens next, so a re-rendered
  // checkout prices for this buyer — including when the answer is "your total
  // changed".
  if (cartRow.email !== buyer.email) {
    await rootDb.cart.update({ where: { id: cartRow.id }, data: { email: buyer.email } });
  }

  const cart = await getCart(store.id, input.kind);
  const lines = toPricedLines(cart.lines);
  if (lines.length === 0) return { ok: false, error: "empty" };

  // The form was parsed for the cart the page showed. If what ships has
  // changed since — a digital item swapped for a mug in another tab — the
  // address it asked for is the wrong one.
  const needsShipping = cart.lines.some((line) => line.available && line.requiresShipping);
  if (needsShipping !== (details.shippingAddress !== null)) {
    return { ok: false, error: "stock-changed" };
  }

  // Priced outside the transaction: loading rules, history and zones is reads
  // only, and the transaction below holds the store's order counter and each
  // discount's row lock, which should be held for as short a time as possible.
  // The rate id is the buyer's request; the quote decides whether this store
  // offers it, to this address, for this order — and at what price. The same
  // goes for the way of paying, and its fee.
  const quote = await priceCheckout(
    store.id,
    cart,
    buyer,
    {
      destination: details.shippingAddress
        ? {
            countryCode: details.shippingAddress.countryCode,
            regionCode: details.shippingAddress.regionCode,
          }
        : null,
      requestedRateId: details.shippingRateId,
    },
    {
      ...input.payment,
      requested: details.paymentMethod,
      countryCode: details.shippingAddress?.countryCode ?? null,
    },
  );
  const { pricing, shipping, payment } = quote;

  if (needsShipping) {
    if (shipping.state !== "ready") return { ok: false, error: "shipping-unavailable" };
    // `chooseRate` falls back to the cheapest when the pick no longer
    // applies. That is right for showing a page, wrong for taking an order.
    if (shipping.selected.id !== details.shippingRateId) {
      return { ok: false, error: "shipping-changed", totalCents: pricing.totalCents };
    }
  }

  // Like the rate, the quote falls back to another way of paying when the
  // buyer's no longer applies. Someone who chose to pay the courier must not
  // find themselves at a card form, nor the other way round.
  if (pricing.totalCents > 0) {
    if (payment.selected === null) return { ok: false, error: "payment-unavailable" };
    if (payment.selected !== details.paymentMethod) {
      return { ok: false, error: "payment-method-changed", totalCents: pricing.totalCents };
    }
  }

  if (pricing.totalCents !== details.expectedTotalCents) {
    return { ok: false, error: "total-changed", totalCents: pricing.totalCents };
  }

  const cashOnDelivery = payment.selected === "cod";
  const rate = shipping.state === "ready" ? shipping.selected : null;
  const zone = shipping.state === "ready" ? shipping.zone : null;
  const amounts = orderAmounts(pricing, store.commissionBps);
  const byLine = new Map(cart.lines.map((line) => [line.id, line]));

  try {
    const order = await rootDb.$transaction(async (tx) => {
      // What was priced must still be what is for sale: same price, still
      // published, still in stock. Scoped by storeId, like every variant read.
      const variants = await tx.variant.findMany({
        where: {
          storeId: store.id,
          id: { in: lines.map((line) => byLine.get(line.id)!.variantId) },
        },
        select: {
          id: true,
          title: true,
          sku: true,
          priceCents: true,
          inventoryQty: true,
          product: {
            select: {
              title: true,
              status: true,
              images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      });
      const variantById = new Map(variants.map((variant) => [variant.id, variant]));

      const orderLines: Omit<Prisma.OrderLineCreateManyInput, "orderId">[] = lines.map((line) => {
        const cartLine = byLine.get(line.id)!;
        const variant = variantById.get(cartLine.variantId);
        if (
          !variant ||
          variant.product.status !== ProductStatus.ACTIVE ||
          variant.priceCents !== line.unitPriceCents ||
          variant.inventoryQty < line.quantity
        ) {
          throw new StockChanged();
        }

        return {
          variantId: variant.id,
          titleSnapshot: variant.product.title,
          variantTitleSnapshot: variant.title,
          skuSnapshot: variant.sku,
          imageUrlSnapshot: variant.product.images[0]?.url ?? null,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          discountCents: pricing.lineDiscounts[line.id] ?? 0,
        };
      });

      // The rate as priced must still exist, in this store and zone, at this
      // price. A seller editing it mid-checkout changes the next quote, not
      // this order.
      if (rate && zone) {
        const current = await tx.shippingRate.findFirst({
          where: { id: rate.id, storeId: store.id, zoneId: zone.id, priceCents: rate.priceCents },
          select: { id: true },
        });
        if (!current) throw new ShippingChanged();
      }

      // The per-store order number. The increment locks the store row, so two
      // orders at once are numbered one after the other, never the same.
      const { orderSequence } = await tx.store.update({
        where: { id: store.id },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });

      const created = await tx.order.create({
        data: {
          storeId: store.id,
          orderNumber: orderSequence,
          userId: buyer.userId,
          email: buyer.email,
          status: OrderStatus.PENDING,
          currency: store.currency,
          ...amounts,
          discountId: primaryDiscountId(pricing.applied),
          appliedDiscounts: appliedDiscountsSnapshot(pricing.applied),
          paymentMethod: paymentMethodOf(payment.selected ?? "stripe"),
          stripeAccountId: cashOnDelivery ? null : store.stripeAccountId,
          // Snapshots, like the lines: editing the zone or the rate later
          // must not change what this order says.
          shippingAddress: details.shippingAddress ?? Prisma.DbNull,
          billingAddress: details.billingAddress,
          shippingRateId: rate?.id ?? null,
          shippingRateName: rate?.name ?? null,
          shippingZoneName: zone?.name ?? null,
          shippingMinDays: rate?.minDeliveryDays ?? null,
          shippingMaxDays: rate?.maxDeliveryDays ?? null,
          marketingConsent: details.marketingConsent,
          note: details.note,
        },
        select: {
          id: true,
          storeId: true,
          orderNumber: true,
          email: true,
          currency: true,
          totalCents: true,
          platformFeeCents: true,
        },
      });

      // One insert, in cart order. Line ids are uuid v7, so ordering a placed
      // order's lines by id gives back the order the buyer added them in.
      await tx.orderLine.createMany({
        data: orderLines.map((line) => ({ ...line, orderId: created.id })),
      });

      // Enforces every usage limit for real, against counts no other checkout
      // can change until this commits. Throws — and so rolls the order back —
      // if a limit was reached since the cart was priced.
      await redeemDiscounts(tx, {
        storeId: store.id,
        orderId: created.id,
        email: buyer.email,
        userId: buyer.userId,
        discountIds: pricing.applied.map((entry) => entry.discountId),
      });

      // The cart stays until the payment succeeds: a declined card sends the
      // buyer back to a checkout that still has everything in it. Cash on
      // delivery has nothing to wait for, so the order is confirmed now.
      if (cashOnDelivery) {
        await confirmCodOrder(tx, created, cartRow.id);
      } else if (created.totalCents === 0) {
        await settleOrder(tx, created, { cartId: cartRow.id, paidAt: new Date() });
      }

      return created;
    });

    if (order.totalCents === 0 || cashOnDelivery) {
      return { ok: true, orderId: order.id, orderNumber: order.orderNumber, clientSecret: null };
    }

    // After the transaction, never inside it: it holds the store's order
    // counter and each discount's row lock, and Stripe is a network call.
    const intent = store.stripeAccountId
      ? await createOrderPaymentIntent(
          order,
          { name: store.name, stripeAccountId: store.stripeAccountId },
          { id: cartRow.id, kind: input.kind },
        )
      : ({ ok: false, error: "payment-unavailable" } as const);

    if (!intent.ok) {
      // Nothing can pay this order now; give its discount uses back.
      await rootDb.$transaction((tx) => cancelUnpaidOrder(tx, order));
      return { ok: false, error: intent.error };
    }

    await rootDb.order.updateMany({
      where: { id: order.id, stripePaymentIntentId: null },
      data: { stripePaymentIntentId: intent.id },
    });

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientSecret: intent.clientSecret,
    };
  } catch (error) {
    if (error instanceof StockChanged || error instanceof CodStockShort) {
      return { ok: false, error: "stock-changed" };
    }
    if (error instanceof ShippingChanged) return { ok: false, error: "shipping-changed" };
    if (error instanceof DiscountRedemptionError) {
      return { ok: false, error: "discount-unavailable" };
    }
    console.error("placeOrder failed", error);
    return { ok: false, error: "failed" };
  }
}

// ---------------------------------------------------------------------------
// The confirmation page
// ---------------------------------------------------------------------------

/**
 * The order just placed, remembered for an hour in an httpOnly cookie rather
 * than put in the URL: a confirmation link someone shares or a browser syncs
 * should not show a stranger the buyer's address.
 */
const LAST_ORDER_COOKIE = "tender_last_order";

export async function rememberPlacedOrder(storeSlug: string, orderId: string) {
  (await cookies()).set(LAST_ORDER_COOKIE, orderId, {
    path: `/s/${storeSlug}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
  });
}

/** The id in the cookie, when it is one. Not yet checked against any store. */
export async function placedOrderId(): Promise<string | null> {
  const orderId = (await cookies()).get(LAST_ORDER_COOKIE)?.value;
  return isUuid(orderId) ? orderId : null;
}

/** The remembered order, scoped to the store it was placed in. */
export async function getPlacedOrder(storeId: string) {
  const orderId = await placedOrderId();
  if (!orderId) return null;

  return rootDb.order.findFirst({
    where: { id: orderId, storeId },
    select: {
      id: true,
      storeId: true,
      status: true,
      paymentMethod: true,
      stripePaymentIntentId: true,
      stripeAccountId: true,
      orderNumber: true,
      email: true,
      currency: true,
      shippingAddress: true,
      billingAddress: true,
      shippingRateName: true,
      shippingMinDays: true,
      shippingMaxDays: true,
      note: true,
      subtotalCents: true,
      discountCents: true,
      shippingCents: true,
      paymentFeeCents: true,
      totalCents: true,
      appliedDiscounts: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          titleSnapshot: true,
          variantTitleSnapshot: true,
          imageUrlSnapshot: true,
          unitPriceCents: true,
          quantity: true,
          discountCents: true,
        },
      },
    },
  });
}
