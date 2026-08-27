import { describe, expect, it } from "vitest";

import { StoreStatus } from "@/lib/db/types";
import {
  canAcceptOrders,
  checkoutBlockedReason,
  isStorePubliclyVisible,
} from "@/lib/stores/policy";

const tradeable = {
  status: StoreStatus.ACTIVE,
  stripeAccountId: "acct_123",
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
};

describe("canAcceptOrders", () => {
  it("is true only when the store is active and fully onboarded", () => {
    expect(canAcceptOrders(tradeable)).toBe(true);
  });

  it("is false for a store that has not finished Connect onboarding", () => {
    expect(
      canAcceptOrders({ ...tradeable, stripeOnboardingComplete: false }),
    ).toBe(false);
  });

  it("is false when there is no connected account to charge", () => {
    // The realistic case: a seller abandons the Stripe redirect halfway.
    expect(canAcceptOrders({ ...tradeable, stripeAccountId: null })).toBe(false);
  });

  it("is false when Stripe has disabled charges on the account", () => {
    expect(canAcceptOrders({ ...tradeable, stripeChargesEnabled: false })).toBe(
      false,
    );
  });

  it("is false for pending and suspended stores", () => {
    expect(canAcceptOrders({ ...tradeable, status: StoreStatus.PENDING })).toBe(
      false,
    );
    expect(
      canAcceptOrders({ ...tradeable, status: StoreStatus.SUSPENDED }),
    ).toBe(false);
  });
});

describe("checkoutBlockedReason", () => {
  it("is null when the store can trade", () => {
    expect(checkoutBlockedReason(tradeable)).toBeNull();
  });

  it("reports suspension ahead of any payment problem", () => {
    const reason = checkoutBlockedReason({
      ...tradeable,
      status: StoreStatus.SUSPENDED,
      stripeChargesEnabled: false,
    });
    expect(reason).toMatch(/suspended/i);
  });

  it("explains incomplete onboarding", () => {
    expect(
      checkoutBlockedReason({ ...tradeable, stripeOnboardingComplete: false }),
    ).toMatch(/setting up payments/i);
  });

  it("distinguishes charges being on hold from onboarding", () => {
    expect(
      checkoutBlockedReason({ ...tradeable, stripeChargesEnabled: false }),
    ).toMatch(/on hold/i);
  });
});

describe("isStorePubliclyVisible", () => {
  it("hides suspended stores and shows everything else", () => {
    expect(isStorePubliclyVisible({ status: StoreStatus.ACTIVE })).toBe(true);
    // A seller mid-onboarding can still share their storefront link.
    expect(isStorePubliclyVisible({ status: StoreStatus.PENDING })).toBe(true);
    expect(isStorePubliclyVisible({ status: StoreStatus.SUSPENDED })).toBe(false);
  });
});
