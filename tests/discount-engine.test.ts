import { describe, expect, it } from "vitest";

import {
  allocateProportionally,
  applyDiscounts,
  evaluateDiscount,
  type DiscountRule,
  type PricedLine,
  type PricingContext,
} from "@/lib/discounts/engine";
import { ANONYMOUS_CUSTOMER, type CustomerProfile } from "@/lib/discounts/segments";

const NOW = new Date("2026-09-26T12:00:00Z");
const EVERYTHING = { appliesTo: "ALL", productIds: [], collectionIds: [] } as const;

let nextId = 0;
function rule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  nextId += 1;
  return {
    id: `d${String(nextId).padStart(3, "0")}`,
    code: null,
    title: "Test discount",
    type: "PERCENTAGE",
    value: 1000,
    discounted: EVERYTHING,
    qualifying: null,
    buyQuantity: null,
    getQuantity: null,
    maxUsesPerOrder: null,
    minSubtotalCents: null,
    minQuantity: null,
    eligibility: "ALL",
    segments: [],
    customerEmails: [],
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    combinable: false,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: null,
    active: true,
    ...overrides,
  };
}

function bxgy(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return rule({
    type: "BUY_X_GET_Y",
    value: 10_000,
    qualifying: EVERYTHING,
    buyQuantity: 2,
    getQuantity: 1,
    ...overrides,
  });
}

function line(
  id: string,
  unitPriceCents: number,
  quantity = 1,
  extra: Partial<PricedLine> = {},
): PricedLine {
  return { id, productId: `p-${id}`, collectionIds: [], unitPriceCents, quantity, ...extra };
}

function context(
  lines: PricedLine[],
  overrides: Partial<PricingContext> = {},
): PricingContext {
  return {
    lines,
    shippingCents: 0,
    customer: ANONYMOUS_CUSTOMER,
    customerRedemptions: new Map(),
    now: NOW,
    ...overrides,
  };
}

const known = (profile: Partial<CustomerProfile> = {}): CustomerProfile => ({
  email: "ana@example.com",
  hasAccount: false,
  settledOrders: 0,
  lastOrderAt: null,
  ...profile,
});

function amount(outcome: ReturnType<typeof evaluateDiscount>): number {
  if (!outcome.ok) throw new Error(`rejected: ${outcome.rejection.reason}`);
  return outcome.applied.amountCents;
}

function rejection(outcome: ReturnType<typeof evaluateDiscount>) {
  if (outcome.ok) throw new Error("expected a rejection");
  return outcome.rejection;
}

describe("allocateProportionally", () => {
  it("splits exactly, giving leftover cents to the largest remainders", () => {
    // 10 cents over three equal lines: 3.33 each, one extra cent to the first.
    const split = allocateProportionally(10, [
      { lineId: "a", weight: 100 },
      { lineId: "b", weight: 100 },
      { lineId: "c", weight: 100 },
    ]);
    expect(split).toEqual([
      { lineId: "a", amountCents: 4 },
      { lineId: "b", amountCents: 3 },
      { lineId: "c", amountCents: 3 },
    ]);
  });

  it("never gives a line more than its weight", () => {
    const split = allocateProportionally(1_001, [
      { lineId: "a", weight: 1 },
      { lineId: "b", weight: 1_000 },
    ]);
    expect(split).toEqual([
      { lineId: "a", amountCents: 1 },
      { lineId: "b", amountCents: 1_000 },
    ]);
  });

  it("stays exact on amounts far past a double's integer range once multiplied", () => {
    const weights = [
      { lineId: "a", weight: 9_900_000_000 },
      { lineId: "b", weight: 3 },
    ];
    const split = allocateProportionally(9_900_000_001, weights);
    expect(split.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(9_900_000_001);
  });
});

describe("conditions", () => {
  const cart = context([line("a", 5_000)]);

  it("refuses a discount that is switched off, not started, over, or used up", () => {
    expect(rejection(evaluateDiscount(rule({ active: false }), cart)).reason).toBe("disabled");
    expect(
      rejection(evaluateDiscount(rule({ startsAt: new Date("2026-10-01T00:00:00Z") }), cart)),
    ).toEqual({ reason: "scheduled", startsAt: new Date("2026-10-01T00:00:00Z") });
    expect(
      rejection(evaluateDiscount(rule({ endsAt: new Date("2026-09-01T00:00:00Z") }), cart))
        .reason,
    ).toBe("expired");
    expect(
      rejection(evaluateDiscount(rule({ usageLimit: 100, usageCount: 100 }), cart)).reason,
    ).toBe("usage-limit");
  });

  it("asks who the buyer is before judging eligibility or a per-customer limit", () => {
    expect(
      rejection(evaluateDiscount(rule({ eligibility: "SEGMENTS", segments: ["FIRST_TIME"] }), cart))
        .reason,
    ).toBe("customer-required");
    expect(rejection(evaluateDiscount(rule({ perCustomerLimit: 1 }), cart)).reason).toBe(
      "customer-required",
    );
  });

  it("limits a segment discount to buyers in any chosen segment", () => {
    const firstOrder = rule({ eligibility: "SEGMENTS", segments: ["FIRST_TIME"] });
    expect(amount(evaluateDiscount(firstOrder, { ...cart, customer: known() }))).toBe(500);
    expect(
      rejection(evaluateDiscount(firstOrder, { ...cart, customer: known({ settledOrders: 1 }) }))
        .reason,
    ).toBe("not-eligible");

    const loyalOrLapsed = rule({ eligibility: "SEGMENTS", segments: ["LOYAL", "LAPSED"] });
    const lapsed = known({ settledOrders: 1, lastOrderAt: new Date("2026-05-01T00:00:00Z") });
    expect(amount(evaluateDiscount(loyalOrLapsed, { ...cart, customer: lapsed }))).toBe(500);
    const recent = known({ settledOrders: 1, lastOrderAt: new Date("2026-09-01T00:00:00Z") });
    expect(
      rejection(evaluateDiscount(loyalOrLapsed, { ...cart, customer: recent })).reason,
    ).toBe("not-eligible");
  });

  it("matches specific customers by email, ignoring case", () => {
    const vip = rule({ eligibility: "CUSTOMERS", customerEmails: ["ana@example.com"] });
    expect(
      amount(evaluateDiscount(vip, { ...cart, customer: known({ email: "Ana@Example.com" }) })),
    ).toBe(500);
    expect(
      rejection(evaluateDiscount(vip, { ...cart, customer: known({ email: "bo@example.com" }) }))
        .reason,
    ).toBe("not-eligible");
  });

  it("stops a buyer at their own limit", () => {
    const once = rule({ perCustomerLimit: 1 });
    const withHistory = (count: number) =>
      evaluateDiscount(once, {
        ...cart,
        customer: known(),
        customerRedemptions: new Map([[once.id, count]]),
      });
    expect(amount(withHistory(0))).toBe(500);
    expect(rejection(withHistory(1)).reason).toBe("customer-limit");
  });
});

describe("percentage and fixed amount", () => {
  it("takes a percentage off the entire order, rounded half-up", () => {
    // 12.5% of $19.99 is 249.875 cents.
    const outcome = evaluateDiscount(
      rule({ value: 1250 }),
      context([line("a", 1_999)]),
    );
    expect(amount(outcome)).toBe(250);
  });

  it("only touches items in scope", () => {
    const mugs = rule({
      value: 2000,
      discounted: { appliesTo: "COLLECTION", productIds: [], collectionIds: ["mugs"] },
    });
    const outcome = evaluateDiscount(
      mugs,
      context([
        line("mug", 2_000, 2, { collectionIds: ["mugs", "kitchen"] }),
        line("plate", 3_000),
      ]),
    );
    expect(outcome.ok && outcome.applied.allocations).toEqual([
      { lineId: "mug", amountCents: 800 },
    ]);

    const nothing = evaluateDiscount(mugs, context([line("plate", 3_000)]));
    expect(rejection(nothing).reason).toBe("no-matching-items");
  });

  it("caps a fixed amount at what the matching items cost, and spreads it", () => {
    const tenOff = rule({ type: "FIXED_AMOUNT", value: 1_000 });
    expect(amount(evaluateDiscount(tenOff, context([line("a", 600)])))).toBe(600);

    const spread = evaluateDiscount(tenOff, context([line("a", 3_000), line("b", 1_000)]));
    expect(spread.ok && spread.applied.allocations).toEqual([
      { lineId: "a", amountCents: 750 },
      { lineId: "b", amountCents: 250 },
    ]);
  });

  it("measures a minimum purchase over the matching items only", () => {
    const outerwear = rule({
      type: "FIXED_AMOUNT",
      value: 2_000,
      minSubtotalCents: 15_000,
      discounted: { appliesTo: "COLLECTION", productIds: [], collectionIds: ["outerwear"] },
    });
    const jacket = line("jacket", 12_000, 1, { collectionIds: ["outerwear"] });

    // $120 of outerwear plus $100 of other things is not $150 of outerwear.
    expect(
      rejection(evaluateDiscount(outerwear, context([jacket, line("boots", 10_000)]))),
    ).toEqual({ reason: "minimum-subtotal", shortfallCents: 3_000 });

    expect(
      amount(evaluateDiscount(outerwear, context([{ ...jacket, quantity: 2 }]))),
    ).toBe(2_000);
  });

  it("enforces a minimum quantity", () => {
    const three = rule({ minQuantity: 3 });
    expect(rejection(evaluateDiscount(three, context([line("a", 1_000, 2)])))).toEqual({
      reason: "minimum-quantity",
      shortfall: 1,
    });
    expect(amount(evaluateDiscount(three, context([line("a", 1_000, 3)])))).toBe(300);
  });
});

describe("free shipping", () => {
  it("saves the shipping charge once its minimum is met", () => {
    const freeOver100 = rule({ type: "FREE_SHIPPING", value: 0, minSubtotalCents: 10_000 });
    const outcome = evaluateDiscount(
      freeOver100,
      context([line("a", 12_000)], { shippingCents: 895 }),
    );
    expect(outcome.ok && outcome.applied).toMatchObject({
      amountCents: 0,
      shippingCents: 895,
      freeShipping: true,
    });
    expect(
      rejection(evaluateDiscount(freeOver100, context([line("a", 9_000)], { shippingCents: 895 })))
        .reason,
    ).toBe("minimum-subtotal");
  });
});

describe("buy X get Y", () => {
  it("gives the cheapest units away and makes the buyer pay for the dearest", () => {
    const outcome = evaluateDiscount(
      bxgy(),
      context([line("a", 3_000), line("b", 1_000), line("c", 2_000)]),
    );
    expect(outcome.ok && outcome.applied.allocations).toEqual([
      { lineId: "b", amountCents: 1_000 },
    ]);
  });

  it("repeats per full set, capped by the per-order limit", () => {
    const sixMugs = context([line("mug", 1_000, 6)]);
    expect(amount(evaluateDiscount(bxgy(), sixMugs))).toBe(2_000);
    expect(amount(evaluateDiscount(bxgy({ maxUsesPerOrder: 1 }), sixMugs))).toBe(1_000);
  });

  it("does not let one unit be both bought and given", () => {
    // Buy 2 get 1 with only two items: nothing is left over to give.
    expect(rejection(evaluateDiscount(bxgy(), context([line("mug", 1_000, 2)]))).reason).toBe(
      "reward-missing",
    );
    expect(rejection(evaluateDiscount(bxgy(), context([line("mug", 1_000, 1)])))).toEqual({
      reason: "buy-quantity",
      shortfall: 1,
    });
  });

  it("spends non-reward items on the buy side first", () => {
    // Buy any 2, get a mug free: the shirts pay, the mug is the reward — even
    // though the mug is also a "qualifying" item.
    const mugFree = bxgy({
      discounted: { appliesTo: "PRODUCT", productIds: ["p-mug"], collectionIds: [] },
    });
    const outcome = evaluateDiscount(
      mugFree,
      context([line("mug", 1_500), line("shirt", 4_000, 2)]),
    );
    expect(outcome.ok && outcome.applied.allocations).toEqual([
      { lineId: "mug", amountCents: 1_500 },
    ]);
  });

  it("applies a partial reward on the last set, and a percentage instead of free", () => {
    const buyOneGetTwoHalfOff = bxgy({ buyQuantity: 1, getQuantity: 2, value: 5_000 });
    // Two units: one bought, one of the two rewards at half price.
    expect(
      amount(evaluateDiscount(buyOneGetTwoHalfOff, context([line("a", 2_000, 2)]))),
    ).toBe(1_000);
  });
});

describe("applyDiscounts", () => {
  const cart = context([line("a", 10_000)], { shippingCents: 900 });

  it("picks the best single discount when none can stack", () => {
    const ten = rule({ value: 1000 });
    const twenty = rule({ value: 2000, code: "TWENTY" });
    const selection = applyDiscounts([ten, twenty], cart);

    expect(selection.applied.map((entry) => entry.discountId)).toEqual([twenty.id]);
    expect(selection.itemsDiscountCents).toBe(2_000);
    expect(selection.rejected.get(ten.id)).toEqual({ reason: "not-combinable" });
  });

  it("stacks combinable discounts in order: percentage first, then fixed", () => {
    const fixed = rule({ type: "FIXED_AMOUNT", value: 1_000, combinable: true });
    const percent = rule({ value: 1000, combinable: true });
    const shipping = rule({ type: "FREE_SHIPPING", value: 0, combinable: true });
    const selection = applyDiscounts([fixed, percent, shipping], cart);

    // 10% of $100, then $10 off the $90 left.
    expect(selection.applied.map((entry) => entry.discountId)).toEqual([
      percent.id,
      fixed.id,
      shipping.id,
    ]);
    expect(selection.itemsDiscountCents).toBe(2_000);
    expect(selection.shippingDiscountCents).toBe(900);
  });

  it("chooses a better stand-alone discount over a weaker stack, and the reverse", () => {
    const stackA = rule({ value: 500, combinable: true });
    const stackB = rule({ type: "FIXED_AMOUNT", value: 500, combinable: true });
    const alone = rule({ value: 1500 });

    expect(applyDiscounts([stackA, stackB, alone], cart).applied.map((e) => e.discountId)).toEqual(
      [alone.id],
    );

    const weakAlone = rule({ value: 500 });
    expect(
      applyDiscounts([stackA, stackB, weakAlone], cart).applied.map((e) => e.discountId),
    ).toEqual([stackA.id, stackB.id]);
  });

  it("never discounts a line below zero when stacking", () => {
    const all = [
      rule({ type: "FIXED_AMOUNT", value: 8_000, combinable: true }),
      rule({ type: "FIXED_AMOUNT", value: 8_000, combinable: true }),
    ];
    const selection = applyDiscounts(all, cart);
    expect(selection.itemsDiscountCents).toBe(10_000);
  });

  it("prefers the buyer's own code on a tie", () => {
    const automatic = rule({ value: 1000 });
    const code = rule({ value: 1000, code: "SAME" });
    const selection = applyDiscounts([automatic, code], cart);
    expect(selection.applied.map((entry) => entry.discountId)).toEqual([code.id]);
  });

  it("reports why the others did not apply", () => {
    const later = rule({ startsAt: new Date("2027-01-01T00:00:00Z") });
    const selection = applyDiscounts([later], cart);
    expect(selection.applied).toEqual([]);
    expect(selection.rejected.get(later.id)?.reason).toBe("scheduled");
  });

  it("does not reuse units across two stacked buy-X-get-Y offers", () => {
    const first = bxgy({ combinable: true });
    const second = bxgy({ combinable: true });
    // Three mugs cover one set; the second offer finds nothing left.
    const selection = applyDiscounts([first, second], context([line("mug", 1_000, 3)]));
    expect(selection.applied.map((entry) => entry.discountId)).toEqual([first.id]);
    expect(selection.itemsDiscountCents).toBe(1_000);
  });
});
