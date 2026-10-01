import { describe, expect, it } from "vitest";

import { DiscountType } from "@/lib/db/types";
import {
  describeDiscount,
  discountState,
  formatDiscountValue,
  type DiscountSummary,
} from "@/lib/discounts/format";

describe("formatDiscountValue", () => {
  it("reads a percentage out of basis points", () => {
    // 1000 bps is 10%. Printing `value` raw would announce 1000% off.
    expect(
      formatDiscountValue({ type: DiscountType.PERCENTAGE, value: 1000 }),
    ).toBe("10% off");
    expect(
      formatDiscountValue({ type: DiscountType.PERCENTAGE, value: 1250 }),
    ).toBe("12.5% off");
  });

  it("formats a fixed amount as money", () => {
    expect(
      formatDiscountValue({ type: DiscountType.FIXED_AMOUNT, value: 500 }),
    ).toBe("$5.00 off");
  });

  it("ignores the value for free shipping", () => {
    expect(
      formatDiscountValue({ type: DiscountType.FREE_SHIPPING, value: 0 }),
    ).toBe("Free shipping");
  });

  it("spells out buy X get Y, free or reduced", () => {
    expect(
      formatDiscountValue({
        type: DiscountType.BUY_X_GET_Y,
        value: 10_000,
        buyQuantity: 2,
        getQuantity: 1,
      }),
    ).toBe("Buy 2, get 1 free");
    expect(
      formatDiscountValue({
        type: DiscountType.BUY_X_GET_Y,
        value: 5_000,
        buyQuantity: 1,
        getQuantity: 1,
      }),
    ).toBe("Buy 1, get 1 at 50% off");
  });
});

describe("describeDiscount", () => {
  const summary: DiscountSummary = {
    type: "PERCENTAGE",
    value: 2000,
    appliesTo: "ALL",
    productCount: 0,
    collectionCount: 0,
    buysFrom: null,
    buyProductCount: 0,
    buyCollectionCount: 0,
    buyQuantity: null,
    getQuantity: null,
    maxUsesPerOrder: null,
    minSubtotalCents: null,
    minQuantity: null,
    eligibility: "ALL",
    segments: [],
    customerCount: 0,
    usageLimit: null,
    perCustomerLimit: null,
    combinable: false,
    startsAt: null,
    endsAt: null,
  };

  it("reads a plain order discount", () => {
    expect(describeDiscount(summary)).toEqual([
      "20% off the entire order",
      "No minimum purchase",
      "For all customers",
      "No usage limits",
      "Can't be combined with other discounts",
    ]);
  });

  it("reads scope, minimum, eligibility, limits and stacking", () => {
    expect(
      describeDiscount({
        ...summary,
        type: "FIXED_AMOUNT",
        value: 1_000,
        appliesTo: "COLLECTION",
        collectionCount: 2,
        minSubtotalCents: 5_000,
        eligibility: "SEGMENTS",
        segments: ["FIRST_TIME", "LAPSED"],
        usageLimit: 100,
        perCustomerLimit: 1,
        combinable: true,
      }),
    ).toEqual([
      "$10.00 off 2 collections",
      "Taken once per order, across the matching items",
      "Minimum purchase of $50.00",
      "For first-time customers or lapsed customers",
      "Limited to 100 uses in total",
      "One use per customer",
      "Combines with other discounts",
    ]);
  });

  it("reads buy X get Y without a minimum line", () => {
    const lines = describeDiscount({
      ...summary,
      type: "BUY_X_GET_Y",
      value: 10_000,
      buysFrom: "PRODUCT",
      buyProductCount: 3,
      buyQuantity: 2,
      getQuantity: 1,
      appliesTo: "ALL",
      maxUsesPerOrder: 1,
      eligibility: "CUSTOMERS",
      customerCount: 1,
    });
    expect(lines.slice(0, 4)).toEqual([
      "Buy 2 items from 3 products",
      "Get 1 item free from any product",
      "Up to 1 time per order",
      "For 1 specific customer",
    ]);
  });
});

describe("discountState", () => {
  const base = {
    active: true,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
  };
  const now = new Date("2026-06-15T12:00:00Z");

  it("is active with no window and no limit", () => {
    expect(discountState(base, now)).toBe("active");
  });

  it("reports the seller's own switch before anything else", () => {
    expect(
      discountState(
        { ...base, active: false, endsAt: new Date("2026-01-01T00:00:00Z") },
        now,
      ),
    ).toBe("disabled");
  });

  it("distinguishes a window that has not opened from one that has closed", () => {
    expect(
      discountState({ ...base, startsAt: new Date("2026-07-01T00:00:00Z") }, now),
    ).toBe("scheduled");
    expect(
      discountState({ ...base, endsAt: new Date("2026-06-01T00:00:00Z") }, now),
    ).toBe("expired");
  });

  it("is active inside its window", () => {
    expect(
      discountState(
        {
          ...base,
          startsAt: new Date("2026-06-01T00:00:00Z"),
          endsAt: new Date("2026-06-30T00:00:00Z"),
        },
        now,
      ),
    ).toBe("active");
  });

  it("reports an exhausted usage limit, but only once it is reached", () => {
    expect(
      discountState({ ...base, usageLimit: 100, usageCount: 99 }, now),
    ).toBe("active");
    expect(
      discountState({ ...base, usageLimit: 100, usageCount: 100 }, now),
    ).toBe("exhausted");
    // Over the limit counts too — a race at checkout should not read as active.
    expect(
      discountState({ ...base, usageLimit: 100, usageCount: 101 }, now),
    ).toBe("exhausted");
  });

  it("prefers the closed window over the usage limit", () => {
    expect(
      discountState(
        {
          ...base,
          endsAt: new Date("2026-06-01T00:00:00Z"),
          usageLimit: 10,
          usageCount: 10,
        },
        now,
      ),
    ).toBe("expired");
  });
});
