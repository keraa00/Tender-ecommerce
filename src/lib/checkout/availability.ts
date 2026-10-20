import "server-only";

import type { CartView } from "@/lib/cart/queries";
import { loadZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere } from "@/lib/shipping/rates";
import { checkoutBlockedReason, type CheckoutBlock } from "@/lib/stores/policy";

type TradingStore = Parameters<typeof checkoutBlockedReason>[0] & { id: string };

/**
 * Why this cart cannot go to checkout, or null when it can — what the drawer
 * and the cart page ask before offering the button. The zones are only
 * loaded when something in the cart ships; a cart of digital products does
 * not care where the store delivers.
 */
export async function cartCheckoutBlock(
  store: TradingStore,
  cart: Pick<CartView, "lines">,
): Promise<CheckoutBlock | null> {
  const requiresShipping = cart.lines.some((line) => line.available && line.requiresShipping);
  return checkoutBlockedReason(store, {
    requiresShipping,
    shipsAnywhere: requiresShipping ? shipsAnywhere(await loadZoneRules(store.id)) : true,
  });
}
