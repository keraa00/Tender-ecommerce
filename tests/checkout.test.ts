import { describe, expect, it } from "vitest";

import { parseCheckoutForm } from "@/lib/checkout/form";
import {
  appliedDiscountsSnapshot,
  emptyPricing,
  orderAmounts,
  primaryDiscountId,
  summarisePricing,
  toPricedLines,
} from "@/lib/checkout/totals";
import type { AppliedDiscount, DiscountRule, DiscountSelection } from "@/lib/discounts/engine";
import { MESSAGES } from "@/lib/i18n/messages";
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
      totalCents: 8000,
      platformFeeCents: 400,
      sellerNetCents: 7600,
    });
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
  const valid = {
    email: "  Ana.Horvat@Example.COM ",
    name: "Ana  Horvat",
    address1: "Ferhadija 12",
    address2: "",
    city: "Sarajevo",
    region: "",
    postalCode: "71000",
    country: "Bosnia and Herzegovina",
    expectedTotal: "8500",
  };
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  it("normalises the email and tidies the address", () => {
    const result = parseCheckoutForm(form(valid));
    expect(result).toEqual({
      ok: true,
      details: {
        email: "ana.horvat@example.com",
        address: {
          name: "Ana Horvat",
          line1: "Ferhadija 12",
          line2: null,
          city: "Sarajevo",
          region: null,
          postalCode: "71000",
          country: "Bosnia and Herzegovina",
        },
        expectedTotalCents: 8500,
      },
    });
  });

  it("reports each missing or malformed field", () => {
    const result = parseCheckoutForm(form({ ...valid, email: "not-an-email", city: " ", country: "" }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { email: "email", city: "required", country: "required" },
    });
    expect(parseCheckoutForm(form({ ...valid, postalCode: "1".repeat(21) }))).toEqual({
      ok: false,
      fieldErrors: { postalCode: "tooLong" },
    });
  });

  it("turns a missing total into one no cart can match", () => {
    const result = parseCheckoutForm(form({ ...valid, expectedTotal: "" }));
    expect(result.ok && result.details.expectedTotalCents).toBe(-1);
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
