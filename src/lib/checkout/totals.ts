import type {
  AppliedDiscount,
  DiscountRejection,
  DiscountRule,
  DiscountSelection,
  PricedLine,
} from "@/lib/discounts/engine";
import { calculatePlatformFee } from "@/lib/money";

/**
 * The arithmetic between the discount engine and an order: what the cart
 * costs, what each entered code did, and the amounts an order row stores. Pure,
 * so the rules are tested without a database — `pricing.ts` does the loading.
 */

/** Codes one cart may hold. The column allows ten; five is plenty to type. */
export const MAX_CART_CODES = 5;

type CartLineLike = {
  id: string;
  productId: string;
  collectionIds: readonly string[];
  unitPriceCents: number;
  quantity: number;
  available: boolean;
};

/** Only lines that can still be bought are priced, as in `cartTotals`. */
export function toPricedLines(lines: readonly CartLineLike[]): PricedLine[] {
  return lines
    .filter((line) => line.available && line.quantity > 0)
    .map((line) => ({
      id: line.id,
      productId: line.productId,
      collectionIds: line.collectionIds,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
    }));
}

export type CodeStatus =
  | { code: string; state: "applied" }
  | { code: string; state: "rejected"; rejection: DiscountRejection }
  /** Deleted, or renamed, since the buyer entered it. */
  | { code: string; state: "unknown" };

export type CartPricing = {
  subtotalCents: number;
  itemsDiscountCents: number;
  shippingCents: number;
  shippingDiscountCents: number;
  totalCents: number;
  applied: AppliedDiscount[];
  /** Each priced line's share of the item discounts, by cart line id. */
  lineDiscounts: Record<string, number>;
  codes: CodeStatus[];
  freeShipping: boolean;
};

/**
 * The one place a total is added up: lines, less item discounts, plus the
 * chosen shipping rate, less what a free-shipping discount took off it. Tax,
 * when it comes (Stripe Tax, computed on this post-discount amount plus
 * shipping), is one more term here and one more column on the order.
 */
export function summarisePricing(
  lines: readonly PricedLine[],
  enteredCodes: readonly string[],
  rules: readonly DiscountRule[],
  selection: DiscountSelection,
  shippingCents: number,
): CartPricing {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );

  const lineDiscounts: Record<string, number> = {};
  for (const applied of selection.applied) {
    for (const allocation of applied.allocations) {
      lineDiscounts[allocation.lineId] =
        (lineDiscounts[allocation.lineId] ?? 0) + allocation.amountCents;
    }
  }

  const appliedIds = new Set(selection.applied.map((entry) => entry.discountId));
  const codes: CodeStatus[] = enteredCodes.map((code) => {
    const rule = rules.find((candidate) => candidate.code === code);
    if (!rule) return { code, state: "unknown" };
    if (appliedIds.has(rule.id)) return { code, state: "applied" };
    return {
      code,
      state: "rejected",
      rejection: selection.rejected.get(rule.id) ?? { reason: "not-combinable" },
    };
  });

  return {
    subtotalCents,
    itemsDiscountCents: selection.itemsDiscountCents,
    shippingCents,
    shippingDiscountCents: selection.shippingDiscountCents,
    totalCents:
      subtotalCents -
      selection.itemsDiscountCents +
      shippingCents -
      selection.shippingDiscountCents,
    applied: selection.applied,
    lineDiscounts,
    codes,
    freeShipping: selection.applied.some((entry) => entry.freeShipping),
  };
}

/** A cart with nothing to price, without asking the database anything. */
export function emptyPricing(enteredCodes: readonly string[]): CartPricing {
  return {
    subtotalCents: 0,
    itemsDiscountCents: 0,
    shippingCents: 0,
    shippingDiscountCents: 0,
    totalCents: 0,
    applied: [],
    lineDiscounts: {},
    codes: enteredCodes.map((code) => ({
      code,
      state: "rejected",
      rejection: { reason: "no-matching-items" },
    })),
    freeShipping: false,
  };
}

/**
 * The money columns of an order.
 *
 * `discountCents` is everything taken off, shipping included, and
 * `shippingCents` is the rate before any free-shipping discount — so
 * `total = subtotal − discount + shipping` holds for every order. Commission is
 * on that post-discount total: the platform takes a cut of what the buyer paid,
 * not of the promotion the seller gave away.
 */
export function orderAmounts(pricing: CartPricing, commissionBps: number) {
  const totalCents = pricing.totalCents;
  const platformFeeCents = calculatePlatformFee(totalCents, commissionBps);

  return {
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.itemsDiscountCents + pricing.shippingDiscountCents,
    shippingCents: pricing.shippingCents,
    totalCents,
    platformFeeCents,
    sellerNetCents: totalCents - platformFeeCents,
  };
}

/** The discount an order's single `discountId` names: whichever took most. */
export function primaryDiscountId(applied: readonly AppliedDiscount[]): string | null {
  let best: AppliedDiscount | null = null;
  for (const entry of applied) {
    const saved = entry.amountCents + entry.shippingCents;
    if (!best || saved > best.amountCents + best.shippingCents) best = entry;
  }
  return best?.discountId ?? null;
}

/** The `appliedDiscounts` snapshot an order stores. */
export function appliedDiscountsSnapshot(applied: readonly AppliedDiscount[]) {
  return applied.map((entry) => ({
    discountId: entry.discountId,
    code: entry.code,
    title: entry.title,
    type: entry.type,
    amountCents: entry.amountCents,
    shippingCents: entry.shippingCents,
  }));
}
