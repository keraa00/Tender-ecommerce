import { describe, expect, it } from "vitest";

import { DiscountType } from "@/lib/db/types";
import { discountState, formatDiscountValue } from "@/lib/discounts/format";

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
