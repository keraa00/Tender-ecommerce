import "server-only";

import { cache } from "react";

import { getCart, type CartView } from "@/lib/cart/queries";
import { applyDiscounts } from "@/lib/discounts/engine";
import { loadCustomerProfile, loadDiscountRules } from "@/lib/discounts/queries";
import {
  SHIPPING_CENTS,
  emptyPricing,
  summarisePricing,
  toPricedLines,
  type CartPricing,
} from "./totals";

/**
 * Prices a cart through the discount engine: automatic discounts plus the
 * codes on the cart, for the given buyer. The drawer, the cart page, the
 * checkout summary and the order itself all come through here, so the buyer
 * never sees one total and is charged another.
 */
export async function priceCart(
  storeId: string,
  cart: Pick<CartView, "lines" | "discountCodes">,
  buyer: { email: string | null; userId: string | null },
  now: Date = new Date(),
): Promise<CartPricing> {
  const lines = toPricedLines(cart.lines);
  // Nothing to discount: skip the two queries on every page of a browsing
  // visitor's session.
  if (lines.length === 0) return emptyPricing(cart.discountCodes);

  const [rules, customer] = await Promise.all([
    loadDiscountRules(storeId, cart.discountCodes, now),
    loadCustomerProfile(storeId, buyer),
  ]);

  const selection = applyDiscounts(rules, {
    lines,
    shippingCents: SHIPPING_CENTS,
    customer: customer.profile,
    customerRedemptions: customer.redemptions,
    now,
  });

  return summarisePricing(lines, cart.discountCodes, rules, selection, SHIPPING_CENTS);
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
