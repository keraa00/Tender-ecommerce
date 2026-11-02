import { describe, expect, it } from "vitest";

import {
  choosePaymentMethod,
  codAvailability,
  codFeeCents,
  readPaymentChoice,
  type CodSettings,
} from "@/lib/payments/cod";

const settings = (overrides: Partial<CodSettings> = {}): CodSettings => ({
  enabled: true,
  label: null,
  instructions: null,
  feeType: "FIXED_AMOUNT",
  feeValue: 300,
  minTotalCents: null,
  maxTotalCents: null,
  countryCodes: [],
  requirePhone: true,
  ...overrides,
});

const order = { baseCents: 10_000, needsShipping: true, countryCode: "BA" };

describe("codFeeCents", () => {
  it("charges a fixed fee as it stands", () => {
    expect(codFeeCents(settings(), 10_000)).toBe(300);
  });

  it("rounds a percentage half-up to the cent", () => {
    const percent = settings({ feeType: "PERCENTAGE", feeValue: 150 });
    expect(codFeeCents(percent, 10_000)).toBe(150);
    expect(codFeeCents(percent, 1_033)).toBe(15); // 15.495
    expect(codFeeCents(percent, 1_034)).toBe(16); // 15.51
  });

  it("charges nothing on an order that comes to nothing", () => {
    expect(codFeeCents(settings(), 0)).toBe(0);
  });
});

describe("codAvailability", () => {
  it("offers it, with its fee, when every rule is met", () => {
    expect(codAvailability(settings(), order)).toEqual({ available: true, feeCents: 300 });
  });

  it("says why not, switched off and undeliverable first", () => {
    expect(codAvailability(settings({ enabled: false }), order)).toEqual({ available: false, reason: "disabled" });
    expect(codAvailability(settings(), { ...order, needsShipping: false })).toEqual({
      available: false,
      reason: "no-shipping",
    });
  });

  it("keeps to the countries chosen, and waits for one when there is none yet", () => {
    const local = settings({ countryCodes: ["BA", "HR"] });
    expect(codAvailability(local, order).available).toBe(true);
    expect(codAvailability(local, { ...order, countryCode: "DE" })).toEqual({ available: false, reason: "country" });
    expect(codAvailability(local, { ...order, countryCode: null })).toEqual({ available: false, reason: "country" });
    expect(codAvailability(settings(), { ...order, countryCode: null }).available).toBe(true);
  });

  it("treats both limits as inclusive", () => {
    const ranged = settings({ minTotalCents: 2_000, maxTotalCents: 10_000 });
    expect(codAvailability(ranged, order).available).toBe(true);
    expect(codAvailability(ranged, { ...order, baseCents: 2_000 }).available).toBe(true);
    expect(codAvailability(ranged, { ...order, baseCents: 1_999 })).toEqual({ available: false, reason: "below-minimum" });
    expect(codAvailability(ranged, { ...order, baseCents: 10_001 })).toEqual({ available: false, reason: "above-maximum" });
  });
});

describe("choosePaymentMethod", () => {
  it("keeps the buyer's pick when it can be used", () => {
    expect(choosePaymentMethod({ stripe: true, cod: true, requested: "cod" })).toBe("cod");
    expect(choosePaymentMethod({ stripe: true, cod: true, requested: "stripe" })).toBe("stripe");
  });

  it("falls back to the card, then to cash, then to nothing", () => {
    expect(choosePaymentMethod({ stripe: true, cod: true, requested: null })).toBe("stripe");
    expect(choosePaymentMethod({ stripe: true, cod: false, requested: "cod" })).toBe("stripe");
    expect(choosePaymentMethod({ stripe: false, cod: true, requested: "stripe" })).toBe("cod");
    expect(choosePaymentMethod({ stripe: false, cod: false, requested: "cod" })).toBeNull();
  });
});

describe("readPaymentChoice", () => {
  it("accepts the two choices and nothing else", () => {
    expect(readPaymentChoice("cod")).toBe("cod");
    expect(readPaymentChoice("stripe")).toBe("stripe");
    expect(readPaymentChoice("COD")).toBeNull();
    expect(readPaymentChoice(undefined)).toBeNull();
  });
});
