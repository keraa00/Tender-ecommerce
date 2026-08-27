import { describe, expect, it } from "vitest";

import {
  calculatePlatformFee,
  formatMoney,
  parseMoneyToCents,
} from "@/lib/money";

describe("calculatePlatformFee", () => {
  it("takes the configured basis points of the total", () => {
    // 5.00% of $100.00
    expect(calculatePlatformFee(10_000, 500)).toBe(500);
    // 7.00% of $249.00
    expect(calculatePlatformFee(24_900, 700)).toBe(1_743);
  });

  it("rounds to the nearest whole cent", () => {
    // 24_999 * 500 / 10_000 = 1249.95
    expect(calculatePlatformFee(24_999, 500)).toBe(1_250);
    // 333 * 500 / 10_000 = 16.65
    expect(calculatePlatformFee(333, 500)).toBe(17);
  });

  it("never exceeds the charge amount", () => {
    // Stripe rejects an application fee larger than the charge, so a
    // misconfigured commission has to fail here, not at the API boundary.
    expect(calculatePlatformFee(1_000, 20_000)).toBe(1_000);
  });

  it("is zero for a zero or negative total", () => {
    expect(calculatePlatformFee(0, 500)).toBe(0);
    expect(calculatePlatformFee(-100, 500)).toBe(0);
  });

  it("is zero when the store has no commission", () => {
    expect(calculatePlatformFee(10_000, 0)).toBe(0);
  });
});

describe("parseMoneyToCents", () => {
  it("parses plain and decorated decimal input", () => {
    expect(parseMoneyToCents("24.99")).toBe(2_499);
    expect(parseMoneyToCents("$24.99")).toBe(2_499);
    expect(parseMoneyToCents("  7 ")).toBe(700);
    expect(parseMoneyToCents("0.05")).toBe(5);
  });

  it("rounds rather than truncating sub-cent input", () => {
    expect(parseMoneyToCents("1.005")).toBe(101);
    expect(parseMoneyToCents("1.004")).toBe(100);
  });

  it("rejects input that is not a price", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1.2.3")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("renders integer cents as a currency string", () => {
    expect(formatMoney(2_499)).toBe("$24.99");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(100_000)).toBe("$1,000.00");
  });
});
