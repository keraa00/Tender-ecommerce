import "server-only";

import { cache } from "react";

import type { ShippingDestination } from "@/lib/address/types";
import { getCart, type CartView } from "@/lib/cart/queries";
import { loadCustomerProfile, loadDiscountRules } from "@/lib/discounts/queries";
import { loadZoneRules } from "@/lib/shipping/queries";
import { quoteCheckout, type CheckoutQuote, type PaymentOptions } from "./quote";
import { emptyPricing, toPricedLines, type CartPricing } from "./totals";

/**
 * Loads what pricing needs — the store's discount rules, the buyer's history,
 * the store's shipping zones — and hands it to `quoteCheckout`, which does the
 * arithmetic. The drawer, the cart page, the checkout summary and the order
 * itself all come through here, so the buyer never sees one total and is
 * charged another.
 */

type Buyer = { email: string | null; userId: string | null };

/**
 * A checkout's price, shipping and payment included: what the address, the
 * picked rate and the way of paying come to, with every discount applied.
 * `destination` is null until the address is complete enough to say where the
 * order is going.
 */
export async function priceCheckout(
  storeId: string,
  cart: Pick<CartView, "lines" | "discountCodes">,
  buyer: Buyer,
  shipping: { destination: ShippingDestination | null; requestedRateId: string | null },
  payment: PaymentOptions,
  now: Date = new Date(),
): Promise<CheckoutQuote> {
  const [rules, customer, zones] = await Promise.all([
    loadDiscountRules(storeId, cart.discountCodes, now),
    loadCustomerProfile(storeId, buyer),
    loadZoneRules(storeId),
  ]);

  return quoteCheckout({
    lines: cart.lines,
    enteredCodes: cart.discountCodes,
    rules,
    customer: customer.profile,
    customerRedemptions: customer.redemptions,
    now,
    zones,
    destination: shipping.destination,
    requestedRateId: shipping.requestedRateId,
    payment,
  });
}

/**
 * A cart's price before anyone has said where it is going: discounts, and
 * shipping left to checkout. What the drawer and the cart page show.
 */
export async function priceCart(
  storeId: string,
  cart: Pick<CartView, "lines" | "discountCodes">,
  buyer: Buyer,
  now: Date = new Date(),
): Promise<CartPricing> {
  // Nothing to discount: skip the queries on every page of a browsing
  // visitor's session.
  if (toPricedLines(cart.lines).length === 0) return emptyPricing(cart.discountCodes);

  const [rules, customer] = await Promise.all([
    loadDiscountRules(storeId, cart.discountCodes, now),
    loadCustomerProfile(storeId, buyer),
  ]);

  return quoteCheckout({
    lines: cart.lines,
    enteredCodes: cart.discountCodes,
    rules,
    customer: customer.profile,
    customerRedemptions: customer.redemptions,
    now,
    zones: [],
    destination: null,
    requestedRateId: null,
  }).pricing;
}

/**
 * This browser's cart and its price, for whoever the cart says is buying —
 * anonymous until an email is given at checkout. Deduplicated per request:
 * the layout's drawer and the page underneath both need it.
 *
 * Signed-in status is left to checkout. Asking Supabase who the visitor is
 * costs a network round trip, and every storefront page renders the drawer.
 */
export const getCartPricing = cache(async (storeId: string) => {
  const cart = await getCart(storeId);
  const pricing = await priceCart(storeId, cart, { email: cart.email, userId: null });
  return { cart, pricing };
});
