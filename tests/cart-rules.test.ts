import { describe, expect, it } from "vitest";

import {
  cartTotals,
  clampLineQuantity,
  MAX_LINE_QUANTITY,
  parseQuantity,
} from "@/lib/cart/rules";

describe("clampLineQuantity", () => {
  it("never exceeds stock", () => {
    expect(clampLineQuantity(5, 3)).toBe(3);
  });

  it("never exceeds the per-line cap", () => {
    expect(clampLineQuantity(500, 10_000)).toBe(MAX_LINE_QUANTITY);
  });

  it("clamps negatives, fractions and garbage", () => {
    expect(clampLineQuantity(-2, 10)).toBe(0);
    expect(clampLineQuantity(2.9, 10)).toBe(2);
    expect(clampLineQuantity(Number.NaN, 10)).toBe(0);
    expect(clampLineQuantity(3, -4)).toBe(0);
  });
});

describe("parseQuantity", () => {
  it("reads whole numbers only", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity("0")).toBe(0);
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("1.5")).toBeNull();
    expect(parseQuantity("1e3")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });
});

describe("cartTotals", () => {
  it("counts only lines that can still be bought", () => {
    expect(
      cartTotals([
        { quantity: 2, unitPriceCents: 1250, available: true },
        { quantity: 1, unitPriceCents: 900, available: true },
        { quantity: 4, unitPriceCents: 5000, available: false },
      ]),
    ).toEqual({ itemCount: 3, subtotalCents: 3400 });
  });
});
