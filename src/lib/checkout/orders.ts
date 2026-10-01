import "server-only";

import { cookies } from "next/headers";

import { getCart } from "@/lib/cart/queries";
import { rootDb } from "@/lib/db/root";
import { OrderStatus, ProductStatus, type Prisma } from "@/lib/db/types";
import { DiscountRedemptionError, redeemDiscounts } from "@/lib/discounts/redemption";
import { isUuid } from "@/lib/ids";
import type { ShippingAddress } from "./form";
import { priceCart } from "./pricing";
import {
  appliedDiscountsSnapshot,
  orderAmounts,
  primaryDiscountId,
  toPricedLines,
} from "./totals";

/**
 * Turning a cart into an order.
 *
 * The order is created Unpaid (PENDING). Card payment arrives with Stripe
 * Connect; until then placing an order records it, reserves its discounts and
 * empties the cart, and the seller settles payment with the buyer directly.
 * Stock is not taken here — the README puts inventory with
 * `payment_intent.succeeded`, so an unpaid order does not hold stock forever.
 */

export type PlaceOrderError =
  | "empty"
  | "stock-changed"
  | "total-changed"
  | "discount-unavailable"
  | "failed";

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: number }
  | { ok: false; error: PlaceOrderError; totalCents?: number };

class StockChanged extends Error {}

export async function placeOrder(input: {
  store: { id: string; commissionBps: number; stripeAccountId: string | null };
  sessionId: string;
  buyer: { email: string; userId: string | null };
  address: ShippingAddress;
  expectedTotalCents: number;
}): Promise<PlaceOrderResult> {
  const { store, buyer } = input;

  const cartRow = await rootDb.cart.findUnique({
    where: { storeId_sessionId: { storeId: store.id, sessionId: input.sessionId } },
    select: { id: true, email: true },
  });
  if (!cartRow) return { ok: false, error: "empty" };

  // Keep the email on the cart whatever happens next, so a re-rendered
  // checkout prices for this buyer — including when the answer is "your total
  // changed".
  if (cartRow.email !== buyer.email) {
    await rootDb.cart.update({ where: { id: cartRow.id }, data: { email: buyer.email } });
  }

  const cart = await getCart(store.id);
  const lines = toPricedLines(cart.lines);
  if (lines.length === 0) return { ok: false, error: "empty" };

  // Priced outside the transaction: loading rules and history is reads only,
  // and the transaction below holds the store's order counter and each
  // discount's row lock, which should be held for as short a time as possible.
  const pricing = await priceCart(store.id, cart, buyer);
  if (pricing.totalCents !== input.expectedTotalCents) {
    return { ok: false, error: "total-changed", totalCents: pricing.totalCents };
  }

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
          ...amounts,
          discountId: primaryDiscountId(pricing.applied),
          appliedDiscounts: appliedDiscountsSnapshot(pricing.applied),
          stripeAccountId: store.stripeAccountId,
          shippingAddress: input.address,
        },
        select: { id: true, orderNumber: true },
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

      await tx.cart.delete({ where: { id: cartRow.id } });

      return created;
    });

    return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
  } catch (error) {
    if (error instanceof StockChanged) return { ok: false, error: "stock-changed" };
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

/** The remembered order, scoped to the store it was placed in. */
export async function getPlacedOrder(storeId: string) {
  const orderId = (await cookies()).get(LAST_ORDER_COOKIE)?.value;
  if (!isUuid(orderId)) return null;

  return rootDb.order.findFirst({
    where: { id: orderId, storeId },
    select: {
      orderNumber: true,
      email: true,
      subtotalCents: true,
      discountCents: true,
      shippingCents: true,
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
