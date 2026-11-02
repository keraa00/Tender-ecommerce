import { describe, expect, it } from "vitest";

import { parseCheckoutForm } from "@/lib/checkout/form";
import { quoteCheckout, type QuoteLine } from "@/lib/checkout/quote";
import {
  addPaymentFee,
  appliedDiscountsSnapshot,
  emptyPricing,
  orderAmounts,
  primaryDiscountId,
  summarisePricing,
  toPricedLines,
} from "@/lib/checkout/totals";
import type { AppliedDiscount, DiscountRule, DiscountSelection } from "@/lib/discounts/engine";
import { ANONYMOUS_CUSTOMER } from "@/lib/discounts/segments";
import type { CodSettings } from "@/lib/payments/cod";
import { MESSAGES } from "@/lib/i18n/messages";
import type { RateRule, ZoneRule } from "@/lib/shipping/rates";
import { codeStatusMessage } from "@/lib/storefront/discount-messages";

const line = (id: string, unitPriceCents: number, quantity = 1, available = true) => ({
  id,
  productId: `p-${id}`,
  collectionIds: [],
  unitPriceCents,
  quantity,
  available,
});

const applied = (overrides: Partial<AppliedDiscount>): AppliedDiscount => ({
  discountId: "d1",
  code: null,
  title: "Discount",
  type: "PERCENTAGE",
  amountCents: 0,
  allocations: [],
  shippingCents: 0,
  freeShipping: false,
  ...overrides,
});

const rule = (id: string, code: string | null) => ({ id, code }) as DiscountRule;

describe("toPricedLines", () => {
  it("prices only lines that can still be bought", () => {
    const priced = toPricedLines([line("a", 1000), line("b", 500, 2, false), line("c", 300, 0)]);
    expect(priced.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("summarisePricing", () => {
  const lines = toPricedLines([line("a", 6000), line("b", 4000)]);

  it("adds up lines, discounts and shipping into one total", () => {
    const selection: DiscountSelection = {
      applied: [
        applied({
          discountId: "pct",
          amountCents: 1000,
          allocations: [
            { lineId: "a", amountCents: 600 },
            { lineId: "b", amountCents: 400 },
          ],
        }),
        applied({
          discountId: "fixed",
          amountCents: 500,
          allocations: [{ lineId: "a", amountCents: 500 }],
        }),
        applied({ discountId: "ship", type: "FREE_SHIPPING", shippingCents: 900, freeShipping: true }),
      ],
      itemsDiscountCents: 1500,
      shippingDiscountCents: 900,
      rejected: new Map(),
    };

    const pricing = summarisePricing(lines, [], [], selection, 900);
    expect(pricing).toMatchObject({
      subtotalCents: 10_000,
      itemsDiscountCents: 1500,
      shippingCents: 900,
      shippingDiscountCents: 900,
      totalCents: 8500,
      lineDiscounts: { a: 1100, b: 400 },
      freeShipping: true,
    });
  });

  it("says what each entered code did", () => {
    const selection: DiscountSelection = {
      applied: [applied({ discountId: "d-welcome", code: "WELCOME10", amountCents: 1000 })],
      itemsDiscountCents: 1000,
      shippingDiscountCents: 0,
      rejected: new Map([["d-big", { reason: "minimum-subtotal", shortfallCents: 2500 }]]),
    };
    const rules = [rule("d-welcome", "WELCOME10"), rule("d-big", "BIGSPEND"), rule("d-alone", "ALONE")];

    const pricing = summarisePricing(
      lines,
      ["WELCOME10", "BIGSPEND", "ALONE", "GONE"],
      rules,
      selection,
      0,
    );
    expect(pricing.codes).toEqual([
      { code: "WELCOME10", state: "applied" },
      { code: "BIGSPEND", state: "rejected", rejection: { reason: "minimum-subtotal", shortfallCents: 2500 } },
      // Applicable on its own, but not chosen: the engine records that as
      // not-combinable, and a code it never mentions reads the same way.
      { code: "ALONE", state: "rejected", rejection: { reason: "not-combinable" } },
      { code: "GONE", state: "unknown" },
    ]);
  });

  it("prices an empty cart without discounts", () => {
    expect(emptyPricing(["WELCOME10"])).toMatchObject({
      subtotalCents: 0,
      totalCents: 0,
      codes: [{ code: "WELCOME10", state: "rejected", rejection: { reason: "no-matching-items" } }],
    });
  });
});

describe("orderAmounts", () => {
  it("charges commission on what the buyer paid, after discounts", () => {
    const pricing = summarisePricing(
      toPricedLines([line("a", 10_000)]),
      [],
      [],
      {
        applied: [applied({ amountCents: 2000, allocations: [{ lineId: "a", amountCents: 2000 }] })],
        itemsDiscountCents: 2000,
        shippingDiscountCents: 0,
        rejected: new Map(),
      },
      0,
    );

    // 5% of $80, not of $100.
    expect(orderAmounts(pricing, 500)).toEqual({
      subtotalCents: 10_000,
      discountCents: 2000,
      shippingCents: 0,
      paymentFeeCents: 0,
      totalCents: 8000,
      platformFeeCents: 400,
      sellerNetCents: 7600,
    });
  });

  it("adds a cash-on-delivery fee to the total, and takes commission on all of it", () => {
    const pricing = addPaymentFee(
      summarisePricing(toPricedLines([line("a", 4000)]), [], [], {
        applied: [],
        itemsDiscountCents: 0,
        shippingDiscountCents: 0,
        rejected: new Map(),
      }, 500),
      200,
    );
    const amounts = orderAmounts(pricing, 500);
    expect(amounts).toMatchObject({ shippingCents: 500, paymentFeeCents: 200, totalCents: 4700 });
    expect(
      amounts.subtotalCents - amounts.discountCents + amounts.shippingCents + amounts.paymentFeeCents,
    ).toBe(amounts.totalCents);
    expect(amounts.platformFeeCents).toBe(235);
    expect(amounts.sellerNetCents).toBe(4465);
  });

  it("keeps total = subtotal − discount + shipping when shipping is discounted", () => {
    const pricing = summarisePricing(
      toPricedLines([line("a", 5000)]),
      [],
      [],
      {
        applied: [applied({ type: "FREE_SHIPPING", shippingCents: 700, freeShipping: true })],
        itemsDiscountCents: 0,
        shippingDiscountCents: 700,
        rejected: new Map(),
      },
      700,
    );
    const amounts = orderAmounts(pricing, 0);
    expect(amounts.subtotalCents - amounts.discountCents + amounts.shippingCents).toBe(
      amounts.totalCents,
    );
    expect(amounts.totalCents).toBe(5000);
  });
});

describe("the order's discount record", () => {
  it("names the discount that took most, and snapshots them all", () => {
    const entries = [
      applied({ discountId: "small", amountCents: 300, code: "SMALL", title: "Small" }),
      applied({ discountId: "big", amountCents: 900, title: "Big" }),
    ];
    expect(primaryDiscountId(entries)).toBe("big");
    expect(primaryDiscountId([])).toBeNull();
    expect(appliedDiscountsSnapshot(entries)).toEqual([
      { discountId: "small", code: "SMALL", title: "Small", type: "PERCENTAGE", amountCents: 300, shippingCents: 0 },
      { discountId: "big", code: null, title: "Big", type: "PERCENTAGE", amountCents: 900, shippingCents: 0 },
    ]);
  });
});

describe("parseCheckoutForm", () => {
  const rules = { firstName: "OPTIONAL", company: "HIDDEN", line2: "OPTIONAL", phone: "OPTIONAL" } as const;
  const options = {
    needsShipping: true,
    shippingRules: rules,
    billingRules: { ...rules, phone: "HIDDEN" as const },
    orderNote: true,
    marketingOptIn: true,
    codRequiresPhone: true,
  };
  const RATE = "01a11058-561a-73eb-81b0-a02d09e8ccce";
  const valid: Record<string, string> = {
    email: "  Ana.Horvat@Example.COM ",
    "shipping.countryCode": "PT",
    "shipping.firstName": "Ana",
    "shipping.lastName": "Horvat",
    "shipping.line1": "Rua da Rosa  210",
    "shipping.city": "Lisbon",
    "shipping.postalCode": "1200385",
    "shipping.phone": "+351 912 345 678",
    shippingRateId: RATE,
    billingAddress: "same",
    note: " Leave with a neighbour ",
    marketingOptIn: "on",
    expectedTotal: "8500",
  };
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  it("normalises the email and reads a structured address, the rate and the extras", () => {
    const result = parseCheckoutForm(form(valid), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.details).toMatchObject({
      email: "ana.horvat@example.com",
      marketingConsent: true,
      note: "Leave with a neighbour",
      shippingRateId: RATE,
      expectedTotalCents: 8500,
      shippingAddress: {
        firstName: "Ana",
        lastName: "Horvat",
        line1: "Rua da Rosa 210",
        postalCode: "1200-385",
        countryCode: "PT",
        phone: "+351 912 345 678",
      },
    });
    // Same as shipping, by default.
    expect(result.details.billingAddress).toEqual(result.details.shippingAddress);
  });

  it("reads how the buyer chose to pay, and pays by card when nothing was chosen", () => {
    const card = parseCheckoutForm(form(valid), options);
    const cash = parseCheckoutForm(form({ ...valid, paymentMethod: "cod" }), options);
    const forged = parseCheckoutForm(form({ ...valid, paymentMethod: "bitcoin" }), options);
    expect(card.ok && card.details.paymentMethod).toBe("stripe");
    expect(cash.ok && cash.details.paymentMethod).toBe("cod");
    expect(forged.ok && forged.details.paymentMethod).toBe("stripe");
  });

  it("requires a phone for cash on delivery when the store asks for one", () => {
    const { "shipping.phone": _phone, ...noPhone } = valid;
    const cash = { ...noPhone, paymentMethod: "cod" };

    const required = parseCheckoutForm(form(cash), options);
    expect(required).toEqual({ ok: false, fieldErrors: { "shipping.phone": "required" } });

    // Not when the store does not ask, nor for a card payment.
    expect(parseCheckoutForm(form(cash), { ...options, codRequiresPhone: false }).ok).toBe(true);
    expect(parseCheckoutForm(form(noPhone), options).ok).toBe(true);
  });

  it("reads a separate billing address, which never asks for the phone", () => {
    const result = parseCheckoutForm(
      form({
        ...valid,
        billingAddress: "different",
        "billing.countryCode": "US",
        "billing.lastName": "Horvat",
        "billing.line1": "1 Main St",
        "billing.city": "Austin",
        "billing.region": "TX",
        "billing.postalCode": "78701",
        "billing.phone": "+1 512 555 0100",
      }),
      options,
    );
    expect(result.ok && result.details.billingAddress).toMatchObject({ countryCode: "US", regionCode: "TX", phone: null });
  });

  it("reports each problem under its field, prefixed by address", () => {
    const result = parseCheckoutForm(
      form({ ...valid, email: "not-an-email", "shipping.city": " ", "shipping.postalCode": "12", shippingRateId: "" }),
      options,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        email: "email",
        "shipping.city": "required",
        "shipping.postalCode": "postalCode",
        shippingRate: "required",
      },
    });
  });

  it("asks only for a billing address when nothing ships", () => {
    const digital = { ...options, needsShipping: false, billingRules: rules };
    const result = parseCheckoutForm(
      form({
        email: "a@b.co",
        "billing.countryCode": "GB",
        "billing.lastName": "Clarke",
        "billing.line1": "61 Victoria Street",
        "billing.city": "Bristol",
        "billing.postalCode": "bs16ad",
        expectedTotal: "6500",
      }),
      digital,
    );
    expect(result.ok && result.details).toMatchObject({
      shippingAddress: null,
      shippingRateId: null,
      billingAddress: { postalCode: "BS1 6AD", countryCode: "GB" },
    });
  });

  it("ignores a note or opt-in the store does not offer", () => {
    const result = parseCheckoutForm(form(valid), { ...options, orderNote: false, marketingOptIn: false });
    expect(result.ok && [result.details.note, result.details.marketingConsent]).toEqual([null, false]);
  });

  it("turns a missing total into one no cart can match", () => {
    const result = parseCheckoutForm(form({ ...valid, expectedTotal: "" }), options);
    expect(result.ok && result.details.expectedTotalCents).toBe(-1);
  });
});

describe("quoteCheckout", () => {
  const NOW = new Date("2026-10-06T12:00:00Z");
  const quoteLine = (id: string, unitPriceCents: number, extra: Partial<QuoteLine> = {}): QuoteLine => ({
    id,
    productId: `p-${id}`,
    collectionIds: [],
    unitPriceCents,
    quantity: 1,
    available: true,
    requiresShipping: true,
    weightGrams: 500,
    ...extra,
  });
  const shippingRate = (id: string, priceCents: number, extra: Partial<RateRule> = {}): RateRule => ({
    id,
    name: id,
    priceCents,
    minDeliveryDays: null,
    maxDeliveryDays: null,
    minSubtotalCents: null,
    maxSubtotalCents: null,
    minWeightGrams: null,
    maxWeightGrams: null,
    position: 0,
    ...extra,
  });
  const discountRule = (overrides: Partial<DiscountRule>): DiscountRule => ({
    id: "d",
    code: null,
    title: "Discount",
    type: "PERCENTAGE",
    value: 1000,
    discounted: { appliesTo: "ALL", productIds: [], collectionIds: [] },
    qualifying: null,
    buyQuantity: null,
    getQuantity: null,
    maxUsesPerOrder: null,
    minSubtotalCents: null,
    minQuantity: null,
    eligibility: "ALL",
    segments: [],
    customerEmails: [],
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    combinable: true,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: null,
    active: true,
    ...overrides,
  });
  const domestic: ZoneRule = {
    id: "z-pt",
    name: "Portugal",
    restOfWorld: false,
    countries: [{ countryCode: "PT", regionCodes: [] }],
    rates: [
      shippingRate("standard", 490),
      shippingRate("express", 990),
      shippingRate("free-over-50", 0, { minSubtotalCents: 5000 }),
    ],
  };
  const lisbon = { countryCode: "PT", regionCode: null };
  const quote = (overrides: Partial<Parameters<typeof quoteCheckout>[0]>) =>
    quoteCheckout({
      lines: [quoteLine("a", 3000)],
      enteredCodes: [],
      rules: [],
      customer: ANONYMOUS_CUSTOMER,
      customerRedemptions: new Map(),
      now: NOW,
      zones: [domestic],
      destination: lisbon,
      requestedRateId: null,
      ...overrides,
    });

  it("adds the cheapest rate that applies, and lists them all", () => {
    const result = quote({});
    expect(result.shipping).toMatchObject({ state: "ready", selected: { id: "standard" } });
    expect(result.shipping.state === "ready" && result.shipping.rates.map((r) => r.id)).toEqual(["standard", "express"]);
    expect(result.pricing).toMatchObject({ subtotalCents: 3000, shippingCents: 490, totalCents: 3490 });
  });

  it("charges the rate the buyer picked", () => {
    expect(quote({ requestedRateId: "express" }).pricing.totalCents).toBe(3990);
  });

  it("zeroes the chosen rate under a free-shipping discount", () => {
    const freeShipping = discountRule({ id: "ship", type: "FREE_SHIPPING", value: 0 });
    const result = quote({ rules: [freeShipping], requestedRateId: "express" });
    expect(result.pricing).toMatchObject({
      shippingCents: 990,
      shippingDiscountCents: 990,
      totalCents: 3000,
      freeShipping: true,
    });
    const amounts = orderAmounts(result.pricing, 500);
    expect(amounts.subtotalCents - amounts.discountCents + amounts.shippingCents).toBe(amounts.totalCents);
  });

  it("judges price-based rates on the subtotal after item discounts", () => {
    const tenOff = discountRule({ id: "ten", type: "FIXED_AMOUNT", value: 1000 });
    // €55 of goods qualifies for free shipping; €45 after the discount does not.
    const result = quote({ lines: [quoteLine("a", 5500)], rules: [tenOff] });
    expect(result.shipping.state === "ready" && result.shipping.rates.map((r) => r.id)).toEqual(["standard", "express"]);
    expect(result.pricing).toMatchObject({ itemsDiscountCents: 1000, shippingCents: 490, totalCents: 4990 });
    expect(quote({ lines: [quoteLine("a", 5500)] }).pricing.totalCents).toBe(5500);
  });

  it("weighs only what ships", () => {
    const heavy: ZoneRule = { ...domestic, rates: [shippingRate("light", 500, { maxWeightGrams: 1000 })] };
    const lines = [quoteLine("mug", 2000, { weightGrams: 800 }), quoteLine("class", 6500, { weightGrams: 5000, requiresShipping: false })];
    const result = quote({ lines, zones: [heavy] });
    expect(result.weightGrams).toBe(800);
    expect(result.shipping.state).toBe("ready");
  });

  it("asks for nothing when nothing ships", () => {
    const result = quote({ lines: [quoteLine("class", 6500, { requiresShipping: false })], destination: null });
    expect(result.shipping).toEqual({ state: "not-required" });
    expect(result.pricing).toMatchObject({ shippingCents: 0, totalCents: 6500 });
  });

  it("waits for an address, and says when the store cannot deliver to one", () => {
    expect(quote({ destination: null }).shipping).toEqual({ state: "address-needed" });
    expect(quote({ destination: { countryCode: "FR", regionCode: null } }).shipping).toEqual({ state: "not-shipped" });
  });

  it("says when a zone has nothing for this order", () => {
    const minimum: ZoneRule = { ...domestic, rates: [shippingRate("over-150", 3500, { minSubtotalCents: 15_000 })] };
    expect(quote({ zones: [minimum] }).shipping).toEqual({ state: "no-rates", zone: { id: "z-pt", name: "Portugal" } });
    expect(quote({ zones: [minimum] }).pricing.totalCents).toBe(3000);
  });

  describe("payment", () => {
    const cod = (overrides: Partial<CodSettings> = {}): CodSettings => ({
      enabled: true,
      label: null,
      instructions: null,
      feeType: "FIXED_AMOUNT",
      feeValue: 200,
      minTotalCents: null,
      maxTotalCents: null,
      countryCodes: [],
      requirePhone: true,
      ...overrides,
    });
    const payment = (overrides: Partial<NonNullable<Parameters<typeof quoteCheckout>[0]["payment"]>> = {}) => ({
      stripe: true,
      cod: cod(),
      requested: null,
      countryCode: "PT",
      ...overrides,
    });

    it("pays by card unless the buyer picks cash, and adds the fee only then", () => {
      const card = quote({ payment: payment() });
      expect(card.payment).toMatchObject({ selected: "stripe", cod: { available: true, feeCents: 200 } });
      expect(card.pricing).toMatchObject({ paymentFeeCents: 0, totalCents: 3490 });

      const cash = quote({ payment: payment({ requested: "cod" }) });
      expect(cash.payment.selected).toBe("cod");
      expect(cash.pricing).toMatchObject({ paymentFeeCents: 200, totalCents: 3690 });
    });

    it("takes a percentage of goods and shipping, after discounts", () => {
      const tenOff = discountRule({ id: "ten", type: "FIXED_AMOUNT", value: 1000 });
      // €30 − €10 + €4.90 shipping = €24.90; 2.5% of that is 62.25 cents, so 62.
      const result = quote({
        rules: [tenOff],
        payment: payment({ requested: "cod", cod: cod({ feeType: "PERCENTAGE", feeValue: 250 }) }),
      });
      expect(result.pricing).toMatchObject({ paymentFeeCents: 62, totalCents: 2552 });
    });

    it("judges the limits and the country on the order, and falls back to the card", () => {
      const over = quote({ payment: payment({ requested: "cod", cod: cod({ maxTotalCents: 3000 }) }) });
      expect(over.payment).toMatchObject({ selected: "stripe", cod: { available: false, reason: "above-maximum" } });
      expect(over.pricing.paymentFeeCents).toBe(0);

      const under = quote({ payment: payment({ requested: "cod", cod: cod({ minTotalCents: 5000 }) }) });
      expect(under.payment.cod).toEqual({ available: false, reason: "below-minimum" });

      const abroad = quote({ payment: payment({ requested: "cod", cod: cod({ countryCodes: ["BA"] }) }) });
      expect(abroad.payment.cod).toEqual({ available: false, reason: "country" });
      expect(quote({ payment: payment({ requested: "cod", cod: cod({ countryCodes: ["PT"] }) }) }).payment.selected).toBe("cod");
    });

    it("judges the country before the rest of the address is in", () => {
      const result = quote({ destination: null, payment: payment({ requested: "cod", cod: cod({ countryCodes: ["PT"] }) }) });
      expect(result.payment.selected).toBe("cod");
    });

    it("offers no cash on delivery when nothing is delivered", () => {
      const result = quote({
        lines: [quoteLine("class", 6500, { requiresShipping: false })],
        destination: null,
        payment: payment({ requested: "cod" }),
      });
      expect(result.payment).toMatchObject({ selected: "stripe", cod: { available: false, reason: "no-shipping" } });
    });

    it("pays in cash when that is all the store takes, and with nothing when it cannot", () => {
      expect(quote({ payment: payment({ stripe: false }) }).payment.selected).toBe("cod");
      const capped = quote({ payment: payment({ stripe: false, cod: cod({ maxTotalCents: 1000 }) }) });
      expect(capped.payment.selected).toBeNull();
    });

    it("charges nothing, and asks for no way to pay, when the order comes to nothing", () => {
      const everything = discountRule({ id: "all", type: "PERCENTAGE", value: 10_000 });
      const freeShipping = discountRule({ id: "ship", type: "FREE_SHIPPING", value: 0 });
      const result = quote({ rules: [everything, freeShipping], payment: payment({ requested: "cod" }) });
      expect(result.pricing).toMatchObject({ paymentFeeCents: 0, totalCents: 0 });
      expect(result.payment.selected).toBeNull();
    });
  });
});

describe("codeStatusMessage", () => {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const status = MESSAGES.en.discountCode.status;

  it("explains each rejection in the buyer's language", () => {
    expect(codeStatusMessage({ code: "A", state: "applied" }, status, "en", money)).toBeNull();
    expect(
      codeStatusMessage(
        { code: "A", state: "rejected", rejection: { reason: "minimum-subtotal", shortfallCents: 2500 } },
        status,
        "en",
        money,
      ),
    ).toBe("Spend $25.00 more on eligible items to use this code.");
    expect(
      codeStatusMessage(
        { code: "A", state: "rejected", rejection: { reason: "buy-quantity", shortfall: 1 } },
        status,
        "en",
        money,
      ),
    ).toBe("Add 1 more eligible item to use this code.");
    expect(
      codeStatusMessage(
        { code: "A", state: "rejected", rejection: { reason: "minimum-quantity", shortfall: 3 } },
        MESSAGES.bs.discountCode.status,
        "bs",
        money,
      ),
    ).toBe("Dodajte još 3 odgovarajuća artikla da biste koristili ovaj kod.");
  });

  it("says the same thing for off, used-up and deleted codes", () => {
    const off = codeStatusMessage(
      { code: "A", state: "rejected", rejection: { reason: "disabled" } },
      status,
      "en",
      money,
    );
    const usedUp = codeStatusMessage(
      { code: "A", state: "rejected", rejection: { reason: "usage-limit" } },
      status,
      "en",
      money,
    );
    const gone = codeStatusMessage({ code: "A", state: "unknown" }, status, "en", money);
    expect(new Set([off, usedUp, gone])).toEqual(new Set([status.unavailable]));
  });
});
