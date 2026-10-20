import type { ShippingDestination } from "@/lib/address/types";
import { applyDiscounts, type DiscountRule } from "@/lib/discounts/engine";
import type { CustomerProfile } from "@/lib/discounts/segments";
import {
  chooseRate,
  eligibleRates,
  zoneFor,
  type RateRule,
  type ZoneRule,
} from "@/lib/shipping/rates";
import { summarisePricing, toPricedLines, type CartPricing } from "./totals";

/**
 * Prices a checkout: its discounts, its shipping, and how the two meet. Pure —
 * `pricing.ts` loads the rules, the zones and the buyer, and the cart drawer,
 * the checkout summary and the order transaction all come through here, so a
 * buyer is never shown one total and charged another.
 *
 * The passes, and why in this order:
 *   1. Discounts with no shipping. Item discounts do not depend on shipping,
 *      so this fixes them — and with them the subtotal after discounts that
 *      price-based rates are judged on (as Shopify judges them).
 *   2. The zone the address falls in, and the rates the order qualifies for
 *      by that subtotal and by the weight of what ships. The buyer's pick, if
 *      it still qualifies, else the cheapest.
 *   3. Discounts again, now with that rate's price, so a free-shipping
 *      discount takes exactly the chosen rate off.
 *
 * One edge is accepted: when a non-combinable free-shipping discount only wins
 * once shipping has a price, pass 3 can drop an item discount pass 1 kept. The
 * rates were judged on the lower subtotal of pass 1; the buyer can only have
 * been offered more, never less.
 */

export type QuoteLine = {
  id: string;
  productId: string;
  collectionIds: readonly string[];
  unitPriceCents: number;
  quantity: number;
  available: boolean;
  requiresShipping: boolean;
  weightGrams: number;
};

export type ShippingQuote =
  /** Nothing in the cart ships: no address, no rate, no charge. */
  | { state: "not-required" }
  /** Not enough address yet to know where it is going. */
  | { state: "address-needed" }
  /** No zone covers the address. */
  | { state: "not-shipped" }
  /** A zone covers it, but none of its rates fits this order. */
  | { state: "no-rates"; zone: { id: string; name: string } }
  | {
      state: "ready";
      zone: { id: string; name: string };
      /** Cheapest first. */
      rates: RateRule[];
      selected: RateRule;
    };

export type CheckoutQuote = {
  pricing: CartPricing;
  shipping: ShippingQuote;
  /** Of the lines that ship. */
  weightGrams: number;
};

export function quoteCheckout(input: {
  lines: readonly QuoteLine[];
  enteredCodes: readonly string[];
  rules: readonly DiscountRule[];
  customer: CustomerProfile;
  customerRedemptions: ReadonlyMap<string, number>;
  now: Date;
  zones: readonly ZoneRule[];
  /** Null until the address is complete enough to price. */
  destination: ShippingDestination | null;
  requestedRateId: string | null;
}): CheckoutQuote {
  const lines = toPricedLines(input.lines);
  const shipping = input.lines.filter(
    (line) => line.available && line.quantity > 0 && line.requiresShipping,
  );
  const weightGrams = shipping.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0);

  const price = (shippingCents: number) =>
    summarisePricing(
      lines,
      input.enteredCodes,
      input.rules,
      applyDiscounts(input.rules, {
        lines,
        shippingCents,
        customer: input.customer,
        customerRedemptions: input.customerRedemptions,
        now: input.now,
      }),
      shippingCents,
    );

  const unshipped = price(0);
  const done = (quote: ShippingQuote, pricing = unshipped): CheckoutQuote => ({
    pricing,
    shipping: quote,
    weightGrams,
  });

  if (shipping.length === 0) return done({ state: "not-required" });
  if (!input.destination) return done({ state: "address-needed" });

  const zone = zoneFor(input.zones, input.destination);
  if (!zone) return done({ state: "not-shipped" });

  const rates = eligibleRates(zone, {
    subtotalCents: unshipped.subtotalCents - unshipped.itemsDiscountCents,
    weightGrams,
  });
  const selected = chooseRate(rates, input.requestedRateId);
  const summary = { id: zone.id, name: zone.name };
  if (!selected) return done({ state: "no-rates", zone: summary });

  return done(
    { state: "ready", zone: summary, rates, selected },
    price(selected.priceCents),
  );
}
