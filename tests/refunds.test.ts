import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/lib/db/types";
import { disputeStillOpen, refundOutcome } from "@/lib/payments/rules";

const paid = { status: OrderStatus.PAID, totalCents: 5_000, refundedCents: 0 };

describe("refundOutcome", () => {
  it("cancels a paid order refunded in full before it was sent", () => {
    expect(refundOutcome(paid, 5_000)).toBe("cancel");
  });

  it("records a partial refund and leaves the order where it is", () => {
    expect(refundOutcome(paid, 1_200)).toBe("record");
    expect(refundOutcome({ ...paid, refundedCents: 1_200 }, 2_000)).toBe("record");
  });

  it("only records a full refund of an order already sent or cancelled", () => {
    expect(refundOutcome({ ...paid, status: OrderStatus.FULFILLED }, 5_000)).toBe("record");
    expect(refundOutcome({ ...paid, status: OrderStatus.CANCELLED }, 5_000)).toBe("record");
  });

  it("ignores a redelivery or an older, smaller total", () => {
    expect(refundOutcome({ ...paid, refundedCents: 2_000 }, 2_000)).toBe("none");
    expect(refundOutcome({ ...paid, refundedCents: 2_000 }, 1_000)).toBe("none");
  });

  it("treats more than the order total as the order total", () => {
    expect(refundOutcome(paid, 9_999)).toBe("cancel");
    expect(refundOutcome({ ...paid, refundedCents: 5_000 }, 9_999)).toBe("none");
  });
});

describe("disputeStillOpen", () => {
  it("clears only when the money stays with the seller", () => {
    expect(disputeStillOpen("won")).toBe(false);
    expect(disputeStillOpen("warning_closed")).toBe(false);
    expect(disputeStillOpen("lost")).toBe(true);
    expect(disputeStillOpen("needs_response")).toBe(true);
  });
});
