import { describe, expect, it } from "vitest";

import { StoreMemberRole, StoreStatus } from "@/lib/db/types";
import {
  canAcceptOrders,
  canChangeCurrency,
  canEditTheme,
  canManagePayments,
  canPublishTheme,
  checkoutBlockedReason,
  isStorePubliclyVisible,
  stripeReady,
} from "@/lib/stores/policy";

const tradeable = {
  status: StoreStatus.ACTIVE,
  stripeAccountId: "acct_123",
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  codEnabled: false,
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

describe("cash on delivery", () => {
  const cashOnly = {
    ...tradeable,
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    stripeChargesEnabled: false,
    codEnabled: true,
  };

  it("lets a store take orders without Stripe", () => {
    expect(stripeReady(cashOnly)).toBe(false);
    expect(canAcceptOrders(cashOnly)).toBe(true);
    expect(canAcceptOrders({ ...tradeable, stripeChargesEnabled: false, codEnabled: true })).toBe(true);
  });

  it("still needs the store to be active", () => {
    expect(canAcceptOrders({ ...cashOnly, status: StoreStatus.PENDING })).toBe(false);
    expect(checkoutBlockedReason({ ...cashOnly, status: StoreStatus.SUSPENDED })).toBe("suspended");
  });

  it("sells what is delivered, and nothing that is not", () => {
    expect(checkoutBlockedReason(cashOnly, { requiresShipping: true, shipsAnywhere: true })).toBeNull();
    expect(checkoutBlockedReason(cashOnly, { requiresShipping: false, shipsAnywhere: true })).toBe(
      "cod-needs-shipping",
    );
    expect(checkoutBlockedReason(cashOnly, { requiresShipping: true, shipsAnywhere: false })).toBe(
      "no-shipping",
    );
  });

  it("leaves digital products to the card when the store has both", () => {
    expect(
      checkoutBlockedReason({ ...tradeable, codEnabled: true }, { requiresShipping: false, shipsAnywhere: true }),
    ).toBeNull();
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
    expect(reason).toBe("suspended");
  });

  it("explains incomplete onboarding", () => {
    expect(checkoutBlockedReason({ ...tradeable, stripeOnboardingComplete: false })).toBe(
      "payments-not-set-up",
    );
  });

  it("distinguishes charges being on hold from onboarding", () => {
    expect(checkoutBlockedReason({ ...tradeable, stripeChargesEnabled: false })).toBe(
      "payments-on-hold",
    );
  });

  it("blocks a cart that has to be delivered by a store that delivers nowhere", () => {
    expect(
      checkoutBlockedReason(tradeable, { requiresShipping: true, shipsAnywhere: false }),
    ).toBe("no-shipping");
  });

  it("still sells digital products when nothing can be shipped", () => {
    expect(
      checkoutBlockedReason(tradeable, { requiresShipping: false, shipsAnywhere: false }),
    ).toBeNull();
  });

  it("puts a payments problem ahead of a shipping one", () => {
    expect(
      checkoutBlockedReason(
        { ...tradeable, stripeChargesEnabled: false },
        { requiresShipping: true, shipsAnywhere: false },
      ),
    ).toBe("payments-on-hold");
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

describe("theme permissions", () => {
  it("let every member edit and publish the storefront's design, as elsewhere in the admin", () => {
    for (const role of [StoreMemberRole.OWNER, StoreMemberRole.STAFF]) {
      expect(canEditTheme({ role })).toBe(true);
      expect(canPublishTheme({ role })).toBe(true);
    }
  });

  it("refuse a role they do not know", () => {
    const unknown = { role: "VIEWER" as StoreMemberRole };
    expect(canEditTheme(unknown)).toBe(false);
    expect(canPublishTheme(unknown)).toBe(false);
  });
});

describe("canManagePayments", () => {
  it("lets only the owner connect or change the Stripe account", () => {
    expect(canManagePayments({ role: StoreMemberRole.OWNER })).toBe(true);
    expect(canManagePayments({ role: StoreMemberRole.STAFF })).toBe(false);
  });
});

describe("canChangeCurrency", () => {
  it("lets a store change currency only before its first order", () => {
    expect(canChangeCurrency({ orderCount: 0 })).toBe(true);
    expect(canChangeCurrency({ orderCount: 1 })).toBe(false);
  });
});
