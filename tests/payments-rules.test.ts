import { describe, expect, it } from "vitest";

import type { PostalAddress } from "@/lib/address/types";
import { CartKind, OrderStatus, PaymentMethod, StoreStatus } from "@/lib/db/types";
import {
  ORDER_METADATA_KEY,
  STRIPE_MERCHANT_COUNTRIES,
  accountReadiness,
  connectedAccountParams,
  eventSignalsCardActive,
  isAccountUnreachable,
  isStripeMerchantCountry,
  orderPaymentIntentParams,
  paymentMismatch,
  paymentOutcome,
  storeFieldsFromAccount,
  stripeBillingDetails,
  stripeLocale,
  supersedeAction,
} from "@/lib/payments/rules";

/** An Accounts v2 account, as far as readiness is concerned. */
function account(input: {
  card?: string;
  payouts?: string;
  entries?: Array<[from: "user" | "stripe", status: "currently_due" | "eventually_due" | "past_due"]>;
}) {
  return {
    configuration: {
      merchant: {
        capabilities: {
          ...(input.card ? { card_payments: { status: input.card } } : {}),
          ...(input.payouts ? { stripe_balance: { payouts: { status: input.payouts } } } : {}),
        },
      },
    },
    requirements: {
      entries: (input.entries ?? []).map(([from, status]) => ({
        awaiting_action_from: from,
        minimum_deadline: { status },
      })),
    },
  };
}

const live = account({ card: "active", payouts: "active" });

describe("connectedAccountParams", () => {
  const input = {
    storeId: "store-1",
    storeSlug: "nordhavn-supply",
    storeName: "Nordhavn Supply",
    ownerEmail: "owner@example.com",
    country: "HR",
    website: null,
  };

  it("creates a Standard-equivalent account: full Dashboard, Stripe collects fees and carries losses", () => {
    const params = connectedAccountParams(input);
    expect(params.dashboard).toBe("full");
    expect(params.defaults?.responsibilities).toEqual({ fees_collector: "stripe", losses_collector: "stripe" });
    expect(params.configuration).toEqual({ merchant: { capabilities: { card_payments: { requested: true } } } });
  });

  it("sets the country, lower-cased, and identifies the store", () => {
    const params = connectedAccountParams(input);
    expect(params.identity).toEqual({ country: "hr" });
    expect(params.contact_email).toBe("owner@example.com");
    expect(params.display_name).toBe("Nordhavn Supply");
    expect(params.metadata).toEqual({ store_id: "store-1", store_slug: "nordhavn-supply" });
    expect(params.include).toEqual(expect.arrayContaining(["configuration.merchant", "requirements"]));
  });

  it("only sends a website when there is a public one", () => {
    expect(connectedAccountParams(input).defaults).not.toHaveProperty("profile");
    expect(connectedAccountParams({ ...input, website: "https://tender.example/s/nordhavn-supply" }).defaults?.profile)
      .toEqual({ business_url: "https://tender.example/s/nordhavn-supply" });
  });
});

describe("STRIPE_MERCHANT_COUNTRIES", () => {
  it("lists where sellers can take card payments, and nowhere Stripe only pays out to", () => {
    expect(isStripeMerchantCountry("US")).toBe(true);
    expect(isStripeMerchantCountry("HR")).toBe(true);
    expect(isStripeMerchantCountry("BA")).toBe(false);
    expect(isStripeMerchantCountry("RS")).toBe(false);
    expect(isStripeMerchantCountry("us")).toBe(false);
    expect(isStripeMerchantCountry(null)).toBe(false);
    expect(new Set(STRIPE_MERCHANT_COUNTRIES).size).toBe(STRIPE_MERCHANT_COUNTRIES.length);
  });
});

describe("accountReadiness", () => {
  it("is live once card payments and payouts are active and nothing is due", () => {
    expect(accountReadiness(live)).toEqual({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      dueCount: 0,
    });
  });

  it("counts only what is waiting on the seller now", () => {
    const fresh = account({
      card: "restricted",
      payouts: "restricted",
      entries: [["user", "past_due"], ["user", "currently_due"], ["user", "eventually_due"], ["stripe", "currently_due"]],
    });
    expect(accountReadiness(fresh)).toMatchObject({ chargesEnabled: false, detailsSubmitted: false, dueCount: 2 });
  });

  it("is submitted while Stripe verifies — the rest is Stripe's to do", () => {
    const reviewing = account({ card: "pending", entries: [["stripe", "currently_due"], ["user", "eventually_due"]] });
    expect(accountReadiness(reviewing)).toMatchObject({ chargesEnabled: false, detailsSubmitted: true, dueCount: 0 });
  });

  it("is not submitted when card payments were never requested, even with nothing listed", () => {
    expect(accountReadiness(account({}))).toMatchObject({ detailsSubmitted: false, chargesEnabled: false });
    expect(accountReadiness({})).toMatchObject({ detailsSubmitted: false, payoutsEnabled: false });
  });
});

describe("storeFieldsFromAccount", () => {
  it("copies the account's state onto the store", () => {
    const reviewing = account({ card: "pending", entries: [["stripe", "currently_due"]] });
    expect(storeFieldsFromAccount(reviewing, StoreStatus.ACTIVE)).toEqual({
      stripeOnboardingComplete: true,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      status: StoreStatus.ACTIVE,
    });
  });

  it("opens a new store once onboarding is done and charges are enabled", () => {
    expect(storeFieldsFromAccount(live, StoreStatus.PENDING).status).toBe(StoreStatus.ACTIVE);
  });

  it("leaves a new store pending while Stripe is still reviewing it, or the seller hasn't finished", () => {
    const reviewing = account({ card: "pending" });
    expect(storeFieldsFromAccount(reviewing, StoreStatus.PENDING).status).toBe(StoreStatus.PENDING);
    const unfinished = account({ card: "restricted", entries: [["user", "past_due"]] });
    expect(storeFieldsFromAccount(unfinished, StoreStatus.PENDING).status).toBe(StoreStatus.PENDING);
  });

  it("never reopens a store the platform suspended", () => {
    expect(storeFieldsFromAccount(live, StoreStatus.SUSPENDED).status).toBe(StoreStatus.SUSPENDED);
  });

  it("never closes an active store when charges are paused — the flag gates checkout", () => {
    const paused = account({ card: "restricted", payouts: "active" });
    const fields = storeFieldsFromAccount(paused, StoreStatus.ACTIVE);
    expect(fields.status).toBe(StoreStatus.ACTIVE);
    expect(fields.stripeChargesEnabled).toBe(false);
  });
});

describe("isAccountUnreachable", () => {
  it("is true when Stripe says the account id is unusable", () => {
    expect(isAccountUnreachable({ code: "resource_missing" })).toBe(true);
    expect(isAccountUnreachable({ code: "account_invalid", statusCode: 403 })).toBe(true);
    // Accounts v2: a malformed id (an old placeholder), and an unknown one.
    expect(isAccountUnreachable({ code: "invalid_fields", statusCode: 400 })).toBe(true);
    expect(isAccountUnreachable({ type: "StripePermissionError", code: "forbidden", statusCode: 403 })).toBe(true);
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

  it("calls a pending cash-on-delivery order placed, not failed", () => {
    const cod = PaymentMethod.CASH_ON_DELIVERY;
    expect(paymentOutcome(OrderStatus.PENDING, null, cod)).toBe("pay-on-delivery");
    expect(paymentOutcome(OrderStatus.PAID, null, cod)).toBe("paid");
    expect(paymentOutcome(OrderStatus.CANCELLED, null, cod)).toBe("cancelled");
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

describe("eventSignalsCardActive", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const at = (secondsAgo: number) => now.getTime() / 1000 - secondsAgo;

  it("is true for a recent event saying card payments are on", () => {
    expect(
      eventSignalsCardActive(
        { type: "account.updated", created: at(5), data: { object: { charges_enabled: true } } },
        now,
      ),
    ).toBe(true);
    expect(
      eventSignalsCardActive(
        { type: "capability.updated", created: at(5), data: { object: { id: "card_payments", status: "active" } } },
        now,
      ),
    ).toBe(true);
  });

  it("is false when the event says anything else", () => {
    expect(
      eventSignalsCardActive(
        { type: "account.updated", created: at(5), data: { object: { charges_enabled: false } } },
        now,
      ),
    ).toBe(false);
    expect(
      eventSignalsCardActive(
        { type: "capability.updated", created: at(5), data: { object: { id: "transfers", status: "active" } } },
        now,
      ),
    ).toBe(false);
    expect(
      eventSignalsCardActive(
        { type: "capability.updated", created: at(5), data: { object: { id: "card_payments", status: "pending" } } },
        now,
      ),
    ).toBe(false);
    expect(eventSignalsCardActive({ type: "payment_intent.succeeded", created: at(5), data: { object: {} } }, now)).toBe(
      false,
    );
  });

  it("ignores old events, so a stale one is never retried for days", () => {
    expect(
      eventSignalsCardActive(
        { type: "account.updated", created: at(11 * 60), data: { object: { charges_enabled: true } } },
        now,
      ),
    ).toBe(false);
  });
});
