import { describe, expect, it } from "vitest";

import { sweepCutoffs } from "@/lib/maintenance/rules";

describe("sweepCutoffs", () => {
  const now = new Date("2026-11-16T03:00:00Z");
  const cutoffs = sweepCutoffs(now);
  const daysBefore = (date: Date) => (now.getTime() - date.getTime()) / 86_400_000;

  it("gives an unpaid card checkout a day", () => {
    expect(daysBefore(cutoffs.unpaidOrders)).toBe(1);
  });

  it("keeps carts and saved checkouts past their cookies' lifetimes", () => {
    // The cart cookie lasts 30 days, the saved-checkout cookie a year.
    expect(daysBefore(cutoffs.carts)).toBeGreaterThan(30);
    expect(daysBefore(cutoffs.savedCheckouts)).toBeGreaterThan(365);
  });

  it("keeps webhook records past Stripe's three days of retries", () => {
    expect(daysBefore(cutoffs.webhookEvents)).toBeGreaterThan(3);
  });
});
