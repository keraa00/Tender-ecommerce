import { describe, expect, it } from "vitest";

import { parseDateTimeInput, toDateTimeInputValue } from "@/lib/dates";
import {
  normalizeDiscountCode,
  parseDiscountForm,
  parsePercentToBps,
  type DiscountDraft,
} from "@/lib/discounts/form";

const NOW = new Date("2026-09-26T12:00:00Z");
const PRODUCT_A = "0199aa00-0000-7000-8000-000000000001";
const PRODUCT_B = "0199aa00-0000-7000-8000-000000000002";
const COLLECTION = "0199aa00-0000-7000-8000-0000000000c1";

type Fields = Record<string, string | string[]>;

function form(fields: Fields): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

const BASE: Fields = {
  method: "code",
  code: "welcome10",
  title: "",
  type: "PERCENTAGE",
  percentValue: "10",
  appliesTo: "ALL",
  minimum: "NONE",
  eligibility: "ALL",
  startsAt: "",
  active: "on",
};

function parse(overrides: Fields = {}) {
  return parseDiscountForm(form({ ...BASE, ...overrides }), NOW);
}

function draft(overrides: Fields = {}): DiscountDraft {
  const result = parse(overrides);
  if (!result.ok) throw new Error(JSON.stringify(result.fieldErrors));
  return result.draft;
}

function errors(overrides: Fields = {}) {
  const result = parse(overrides);
  if (result.ok) throw new Error("expected errors");
  return result.fieldErrors;
}

describe("parsePercentToBps", () => {
  it("reads percentages to two decimals without floats", () => {
    expect(parsePercentToBps("10")).toBe(1000);
    expect(parsePercentToBps("12.5%")).toBe(1250);
    expect(parsePercentToBps("0.01")).toBe(1);
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("-5")).toBeNull();
  });
});

describe("datetime inputs", () => {
  it("round-trips a UTC datetime-local value", () => {
    const date = parseDateTimeInput("2026-10-01T09:30");
    expect(date?.toISOString()).toBe("2026-10-01T09:30:00.000Z");
    expect(toDateTimeInputValue(date!)).toBe("2026-10-01T09:30");
  });

  it("rejects dates that do not exist instead of rolling them over", () => {
    expect(parseDateTimeInput("2026-02-31T10:00")).toBeNull();
    expect(parseDateTimeInput("2026-10-01T24:00")).toBeNull();
    expect(parseDateTimeInput("tomorrow")).toBeNull();
  });
});

describe("parseDiscountForm", () => {
  it("normalises the code and uses it as the title when none is given", () => {
    const result = draft();
    expect(result.code).toBe("WELCOME10");
    expect(result.title).toBe("WELCOME10");
    expect(result.value).toBe(1000);
    expect(normalizeDiscountCode("  summer-24 ")).toBe("SUMMER-24");
  });

  it("starts a discount now when no start is given", () => {
    expect(draft().startsAt).toEqual(NOW);
    expect(draft({ startsAt: "2026-10-01T00:00" }).startsAt.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("validates the code", () => {
    expect(errors({ code: "" }).code).toMatch(/Enter a code/);
    expect(errors({ code: "AB" }).code).toMatch(/3 to 32/);
    expect(errors({ code: "TWO WORDS" }).code).toMatch(/no spaces/);
  });

  it("needs a title for an automatic discount, and drops any code", () => {
    expect(errors({ method: "automatic" }).title).toMatch(/Buyers see it/);
    const automatic = draft({ method: "automatic", title: "Autumn sale" });
    expect(automatic.code).toBeNull();
  });

  it("validates the value for each type", () => {
    expect(errors({ percentValue: "0" }).value).toBeDefined();
    expect(errors({ percentValue: "100.5" }).value).toBeDefined();
    expect(draft({ percentValue: "100" }).value).toBe(10_000);

    expect(draft({ type: "FIXED_AMOUNT", amountValue: "$10" }).value).toBe(1_000);
    expect(errors({ type: "FIXED_AMOUNT", amountValue: "0" }).value).toBeDefined();

    const shipping = draft({ type: "FREE_SHIPPING", appliesTo: "PRODUCT", productId: PRODUCT_A });
    expect(shipping).toMatchObject({ value: 0, appliesTo: "ALL", productIds: [] });
  });

  it("requires targets for a specific scope and keeps only that scope's", () => {
    expect(errors({ appliesTo: "PRODUCT" }).appliesTo).toMatch(/at least one product/);

    const products = draft({
      appliesTo: "PRODUCT",
      productId: [PRODUCT_A, PRODUCT_B, PRODUCT_A, "not-a-uuid"],
      collectionId: COLLECTION,
    });
    expect(products.productIds).toEqual([PRODUCT_A, PRODUCT_B]);
    expect(products.collectionIds).toEqual([]);

    const whole = draft({ appliesTo: "ALL", productId: PRODUCT_A });
    expect(whole.productIds).toEqual([]);
  });

  it("parses buy X get Y and drops a minimum it does not use", () => {
    const offer = draft({
      type: "BUY_X_GET_Y",
      buysFrom: "COLLECTION",
      buyCollectionId: COLLECTION,
      buyQuantity: "2",
      getQuantity: "1",
      appliesTo: "PRODUCT",
      productId: PRODUCT_A,
      getDiscount: "free",
      minimum: "SUBTOTAL",
      minSubtotal: "50",
    });
    expect(offer).toMatchObject({
      value: 10_000,
      buysFrom: "COLLECTION",
      buyCollectionIds: [COLLECTION],
      buyQuantity: 2,
      getQuantity: 1,
      productIds: [PRODUCT_A],
      maxUsesPerOrder: null,
      minSubtotalCents: null,
    });

    const halfOff = draft({
      type: "BUY_X_GET_Y",
      buysFrom: "ALL",
      buyQuantity: "1",
      getQuantity: "1",
      getDiscount: "percentage",
      getPercent: "50",
      limitUsesPerOrder: "on",
      maxUsesPerOrder: "2",
    });
    expect(halfOff).toMatchObject({ value: 5_000, maxUsesPerOrder: 2 });

    const bad = errors({ type: "BUY_X_GET_Y", buysFrom: "PRODUCT", buyQuantity: "0" });
    expect(bad.buysFrom).toMatch(/customer buys/);
    expect(bad.buyQuantity).toBeDefined();
    expect(bad.getQuantity).toBeDefined();
  });

  it("clears the BXGY fields from every other type", () => {
    const plain = draft({ buyQuantity: "2", getQuantity: "1", buysFrom: "ALL" });
    expect(plain).toMatchObject({ buysFrom: null, buyQuantity: null, getQuantity: null });
  });

  it("keeps exactly one minimum", () => {
    expect(draft({ minimum: "SUBTOTAL", minSubtotal: "50.00", minQuantity: "3" })).toMatchObject({
      minSubtotalCents: 5_000,
      minQuantity: null,
    });
    expect(draft({ minimum: "QUANTITY", minQuantity: "3" })).toMatchObject({
      minSubtotalCents: null,
      minQuantity: 3,
    });
    expect(errors({ minimum: "QUANTITY", minQuantity: "" }).minimum).toBeDefined();
  });

  it("parses segments and customer emails", () => {
    expect(
      draft({ eligibility: "SEGMENTS", segment: ["FIRST_TIME", "BOGUS", "FIRST_TIME"] }).segments,
    ).toEqual(["FIRST_TIME"]);
    expect(errors({ eligibility: "SEGMENTS" }).eligibility).toMatch(/segment/);

    const customers = draft({
      eligibility: "CUSTOMERS",
      customerEmail: ["Ana@Example.com", "bo@example.com, ana@example.com"],
      segment: "LOYAL",
    });
    expect(customers.customerEmails).toEqual(["ana@example.com", "bo@example.com"]);
    expect(customers.segments).toEqual([]);

    expect(
      errors({ eligibility: "CUSTOMERS", customerEmail: "not-an-email" }).eligibility,
    ).toMatch(/not-an-email/);
  });

  it("reads usage limits only when their box is ticked", () => {
    expect(draft({ usageLimit: "100" }).usageLimit).toBeNull();
    expect(
      draft({ limitTotalUses: "on", usageLimit: "100", limitPerCustomer: "on", perCustomerLimit: "1" }),
    ).toMatchObject({ usageLimit: 100, perCustomerLimit: 1 });
    expect(errors({ limitTotalUses: "on", usageLimit: "0" }).usageLimit).toBeDefined();
  });

  it("needs the end after the start", () => {
    expect(
      draft({ hasEndDate: "on", startsAt: "2026-10-01T00:00", endsAt: "2026-10-31T23:59" })
        .endsAt?.toISOString(),
    ).toBe("2026-10-31T23:59:00.000Z");
    expect(
      errors({ hasEndDate: "on", startsAt: "2026-10-01T00:00", endsAt: "2026-09-01T00:00" })
        .endsAt,
    ).toMatch(/after the start/);
    expect(draft({ endsAt: "2026-09-01T00:00" }).endsAt).toBeNull();
  });

  it("reads the toggles", () => {
    expect(draft()).toMatchObject({ active: true, combinable: false });
    expect(draft({ active: [], combinable: "on" })).toMatchObject({
      active: false,
      combinable: true,
    });
  });
});
