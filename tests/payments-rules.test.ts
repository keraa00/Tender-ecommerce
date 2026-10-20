import { describe, expect, it } from "vitest";

import type { PostalAddress } from "@/lib/address/types";
import { CartKind, OrderStatus, StoreStatus } from "@/lib/db/types";
import {
  CONNECT_CONTROLLER,
  ORDER_METADATA_KEY,
  isAccountUnreachable,
  orderPaymentIntentParams,
  paymentMismatch,
  paymentOutcome,
  storeFieldsFromAccount,
  stripeBillingDetails,
  stripeLocale,
  supersedeAction,
} from "@/lib/payments/rules";

const onboarded = { details_submitted: true, charges_enabled: true, payouts_enabled: true };

describe("CONNECT_CONTROLLER", () => {
  it("is the Standard-equivalent configuration", () => {
    expect(CONNECT_CONTROLLER).toEqual({
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    });
  });
});

describe("storeFieldsFromAccount", () => {
  it("copies the account's flags onto the store", () => {
    expect(
      storeFieldsFromAccount(
        { details_submitted: true, charges_enabled: false, payouts_enabled: false },
        StoreStatus.ACTIVE,
      ),
    ).toEqual({
      stripeOnboardingComplete: true,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      status: StoreStatus.ACTIVE,
    });
  });

  it("opens a new store once onboarding is done and charges are enabled", () => {
    expect(storeFieldsFromAccount(onboarded, StoreStatus.PENDING).status).toBe(StoreStatus.ACTIVE);
  });

  it("leaves a new store pending while Stripe is still reviewing it", () => {
    const reviewing = { ...onboarded, charges_enabled: false };
    expect(storeFieldsFromAccount(reviewing, StoreStatus.PENDING).status).toBe(StoreStatus.PENDING);
    const unfinished = { ...onboarded, details_submitted: false };
    expect(storeFieldsFromAccount(unfinished, StoreStatus.PENDING).status).toBe(StoreStatus.PENDING);
  });

  it("never reopens a store the platform suspended", () => {
    expect(storeFieldsFromAccount(onboarded, StoreStatus.SUSPENDED).status).toBe(StoreStatus.SUSPENDED);
  });

  it("never closes an active store when charges are paused — the flag gates checkout", () => {
    const paused = { ...onboarded, charges_enabled: false };
    const fields = storeFieldsFromAccount(paused, StoreStatus.ACTIVE);
    expect(fields.status).toBe(StoreStatus.ACTIVE);
    expect(fields.stripeChargesEnabled).toBe(false);
  });
});

describe("isAccountUnreachable", () => {
  it("is true when Stripe says the account is missing or out of reach", () => {
    expect(isAccountUnreachable({ code: "resource_missing" })).toBe(true);
    expect(isAccountUnreachable({ code: "account_invalid", statusCode: 403 })).toBe(true);
    expect(isAccountUnreachable({ type: "StripePermissionError", statusCode: 403 })).toBe(true);
    expect(isAccountUnreachable({ statusCode: 404 })).toBe(true);
  });

  it("is false for anything transient or unrelated to the account", () => {
    expect(isAccountUnreachable({ type: "StripeConnectionError" })).toBe(false);
    expect(isAccountUnreachable({ type: "StripeAPIError", statusCode: 500 })).toBe(false);
    expect(isAccountUnreachable({ type: "StripeAuthenticationError", statusCode: 401 })).toBe(false);
    expect(isAccountUnreachable(new Error("socket hang up"))).toBe(false);
    expect(isAccountUnreachable(null)).toBe(false);
    expect(isAccountUnreachable("resource_missing")).toBe(false);
  });
});

const order = {
  id: "0199a000-0000-7000-8000-000000000001",
  storeId: "0199a000-0000-7000-8000-000000000002",
  orderNumber: 1042,
  email: "buyer@example.com",
  currency: "EUR",
  totalCents: 5_400,
  platformFeeCents: 270,
};
const cart = { id: "0199a000-0000-7000-8000-000000000003", kind: CartKind.BUY_NOW };

describe("orderPaymentIntentParams", () => {
  it("charges the order total, with the commission as the application fee", () => {
    const { params, idempotencyKey } = orderPaymentIntentParams(order, { name: "Rosewater" }, cart);
    expect(params).toMatchObject({
      amount: 5_400,
      currency: "eur",
      application_fee_amount: 270,
      automatic_payment_methods: { enabled: true },
      receipt_email: "buyer@example.com",
      description: "Rosewater order #1042",
    });
    expect(idempotencyKey).toBe(`pi:${order.id}`);
  });

  it("links the PaymentIntent back to the order and the cart it came from", () => {
    const { params } = orderPaymentIntentParams(order, { name: "Rosewater" }, cart);
    expect(params.metadata).toEqual({
      [ORDER_METADATA_KEY]: order.id,
      store_id: order.storeId,
      cart_id: cart.id,
      cart_kind: "BUY_NOW",
      order_number: "1042",
    });
  });

  it("leaves the fee off at zero, where Stripe would refuse it", () => {
    const { params } = orderPaymentIntentParams({ ...order, platformFeeCents: 0 }, { name: "R" }, cart);
    expect(params).not.toHaveProperty("application_fee_amount");
  });
});

describe("paymentMismatch", () => {
  const placed = { totalCents: 5_400, currency: "EUR", stripeAccountId: "acct_seller" };
  const intent = { amount: 5_400, currency: "eur" };

  it("accepts a PaymentIntent for this order on this seller's account", () => {
    expect(paymentMismatch(placed, intent, "acct_seller")).toBeNull();
  });

  it("refuses one from another account, or with no account at all", () => {
    expect(paymentMismatch(placed, intent, "acct_rival")).toBe("account");
    expect(paymentMismatch(placed, intent, null)).toBe("account");
    expect(paymentMismatch({ ...placed, stripeAccountId: null }, intent, "acct_seller")).toBe("account");
  });

  it("refuses another amount or currency", () => {
    expect(paymentMismatch(placed, { ...intent, amount: 5_399 }, "acct_seller")).toBe("amount");
    expect(paymentMismatch(placed, { ...intent, currency: "usd" }, "acct_seller")).toBe("currency");
  });
});

describe("paymentOutcome", () => {
  it("trusts the order once it has moved on", () => {
    expect(paymentOutcome(OrderStatus.PAID, null)).toBe("paid");
    expect(paymentOutcome(OrderStatus.FULFILLED, "requires_payment_method")).toBe("paid");
    expect(paymentOutcome(OrderStatus.CANCELLED, "succeeded")).toBe("cancelled");
  });

  it("reads a pending order's PaymentIntent", () => {
    expect(paymentOutcome(OrderStatus.PENDING, "succeeded")).toBe("paid");
    expect(paymentOutcome(OrderStatus.PENDING, "processing")).toBe("processing");
    expect(paymentOutcome(OrderStatus.PENDING, "requires_payment_method")).toBe("failed");
    expect(paymentOutcome(OrderStatus.PENDING, "requires_action")).toBe("failed");
    expect(paymentOutcome(OrderStatus.PENDING, "canceled")).toBe("failed");
    expect(paymentOutcome(OrderStatus.PENDING, null)).toBe("failed");
  });
});

describe("supersedeAction", () => {
  it("never cancels money that is in or on its way", () => {
    expect(supersedeAction("succeeded")).toBe("settle");
    expect(supersedeAction("processing")).toBe("wait");
    expect(supersedeAction("requires_capture")).toBe("wait");
  });

  it("cancels an attempt that can still be paid, and skips one already cancelled", () => {
    expect(supersedeAction("requires_payment_method")).toBe("cancel");
    expect(supersedeAction("requires_confirmation")).toBe("cancel");
    expect(supersedeAction("requires_action")).toBe("cancel");
    expect(supersedeAction("canceled")).toBe("gone");
  });
});

describe("stripeBillingDetails", () => {
  const address: PostalAddress = {
    firstName: "Amira",
    lastName: "Hadžić",
    company: null,
    line1: "Ferhadija 12",
    line2: null,
    city: "Sarajevo",
    regionCode: null,
    region: null,
    postalCode: "71000",
    countryCode: "BA",
    phone: null,
  };

  it("passes every field, empty where the buyer was not asked", () => {
    expect(stripeBillingDetails("amira@example.com", address)).toEqual({
      name: "Amira Hadžić",
      email: "amira@example.com",
      address: {
        line1: "Ferhadija 12",
        line2: "",
        city: "Sarajevo",
        state: "",
        postal_code: "71000",
        country: "BA",
      },
    });
  });

  it("uses the region code where there is one, and copes without a first name", () => {
    const details = stripeBillingDetails("a@example.com", {
      ...address,
      firstName: null,
      regionCode: "CA",
      region: "California",
      countryCode: "US",
    });
    expect(details.name).toBe("Hadžić");
    expect(details.address.state).toBe("CA");
  });
});

describe("stripeLocale", () => {
  it("passes supported languages through and maps Bosnian to Croatian", () => {
    expect(stripeLocale("en")).toBe("en");
    expect(stripeLocale("ja")).toBe("ja");
    expect(stripeLocale("bs")).toBe("hr");
  });
});
