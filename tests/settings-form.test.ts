import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/admin/en";
import {
  codSettingsFormValues,
  parseCheckoutSettingsForm as parseCheckoutIn,
  parseCodSettingsForm as parseCodIn,
  parseGeneralSettingsForm as parseGeneralIn,
} from "@/lib/stores/settings-form";

const parseGeneralSettingsForm = (formData: FormData) => parseGeneralIn(formData, en);
const parseCheckoutSettingsForm = (formData: FormData) => parseCheckoutIn(formData, en);
const parseCodSettingsForm = (formData: FormData) => parseCodIn(formData, en);

function data(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
}

describe("parseGeneralSettingsForm", () => {
  it("reads a supported currency and a lower-cased contact email", () => {
    expect(parseGeneralSettingsForm(data({ currency: "eur", contactEmail: " Hello@Shop.Example " }))).toEqual({
      ok: true,
      settings: { currency: "EUR", contactEmail: "hello@shop.example" },
    });
  });

  it("falls back to no contact email when the field is empty", () => {
    const result = parseGeneralSettingsForm(data({ currency: "USD", contactEmail: "" }));
    expect(result.ok && result.settings.contactEmail).toBeNull();
  });

  it("refuses a currency that is not offered — no cents of the yen", () => {
    const result = parseGeneralSettingsForm(data({ currency: "JPY" }));
    expect(!result.ok && result.fieldErrors.currency).toBeDefined();
  });

  it("refuses an email that is not one", () => {
    const result = parseGeneralSettingsForm(data({ currency: "USD", contactEmail: "studio" }));
    expect(!result.ok && result.fieldErrors.contactEmail).toBeDefined();
  });
});

describe("parseCheckoutSettingsForm", () => {
  const valid = {
    checkoutPhone: "REQUIRED",
    checkoutCompany: "HIDDEN",
    checkoutFirstName: "OPTIONAL",
    checkoutAddress2: "OPTIONAL",
  };

  it("reads each field's mode and the two checkboxes", () => {
    expect(parseCheckoutSettingsForm(data({ ...valid, checkoutOrderNote: "on" }))).toEqual({
      ok: true,
      settings: {
        ...valid,
        checkoutMarketingOptIn: false,
        checkoutOrderNote: true,
      },
    });
  });

  it("never hides the first name nor requires address line 2", () => {
    const result = parseCheckoutSettingsForm(
      data({ ...valid, checkoutFirstName: "HIDDEN", checkoutAddress2: "REQUIRED" }),
    );
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual([
      "checkoutAddress2",
      "checkoutFirstName",
    ]);
  });
});

describe("parseCodSettingsForm", () => {
  const cod = (entries: Record<string, string>, countries: string[] = []) => {
    const form = data(entries);
    for (const code of countries) form.append("codCountry", code);
    return form;
  };

  it("reads a fixed fee, the limits, the extras and a trimmed label", () => {
    expect(
      parseCodSettingsForm(
        cod({
          codEnabled: "on",
          codLabel: "  Plaćanje pouzećem ",
          codInstructions: " Pripremite tačan iznos. ",
          codFeeType: "FIXED_AMOUNT",
          codFee: "2.50",
          codMinTotal: "",
          codMaxTotal: "500",
          codCountryScope: "all",
          codRequirePhone: "on",
        }),
      ),
    ).toEqual({
      ok: true,
      settings: {
        codEnabled: true,
        codLabel: "Plaćanje pouzećem",
        codInstructions: "Pripremite tačan iznos.",
        codFeeType: "FIXED_AMOUNT",
        codFeeValue: 250,
        codMinTotalCents: null,
        codMaxTotalCents: 50_000,
        codCountryCodes: [],
        codRequirePhone: true,
      },
    });
  });

  it("reads a percentage as basis points, and blanks as nothing", () => {
    const result = parseCodSettingsForm(cod({ codFeeType: "PERCENTAGE", codFee: "2.5%", codLabel: " " }));
    expect(result.ok && result.settings).toMatchObject({
      codEnabled: false,
      codLabel: null,
      codInstructions: null,
      codFeeType: "PERCENTAGE",
      codFeeValue: 250,
      codRequirePhone: false,
    });
    expect(parseCodSettingsForm(cod({ codFee: "" })).ok && true).toBe(true);
  });

  it("limits it to the countries chosen, upper-cased and once each", () => {
    const result = parseCodSettingsForm(cod({ codCountryScope: "some" }, ["ba", "HR", "BA"]));
    expect(result.ok && result.settings.codCountryCodes).toEqual(["BA", "HR"]);
    // Countries posted with "everywhere" chosen are ignored.
    const everywhere = parseCodSettingsForm(cod({ codCountryScope: "all" }, ["BA"]));
    expect(everywhere.ok && everywhere.settings.codCountryCodes).toEqual([]);
  });

  it("says what is wrong, field by field", () => {
    const result = parseCodSettingsForm(
      cod({ codFeeType: "PERCENTAGE", codFee: "120", codMinTotal: "100", codMaxTotal: "50", codCountryScope: "some", codLabel: "x".repeat(61) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["codCountries", "codFee", "codLabel", "codMaxTotal"]);
    expect(parseCodSettingsForm(cod({ codFee: "-2" })).ok).toBe(false);
    expect(parseCodSettingsForm(cod({ codMinTotal: "lots" })).ok).toBe(false);
    expect(parseCodSettingsForm(cod({ codCountryScope: "some" }, ["XX"])).ok).toBe(false);
  });

  it("writes saved settings back the way they were typed", () => {
    const values = codSettingsFormValues({
      codEnabled: true,
      codLabel: null,
      codInstructions: null,
      codFeeType: "PERCENTAGE",
      codFeeValue: 250,
      codMinTotalCents: null,
      codMaxTotalCents: 50_000,
      codCountryCodes: ["BA"],
      codRequirePhone: true,
    });
    expect(values).toMatchObject({
      codLabel: "",
      codFee: "2.5",
      codMinTotal: "",
      codMaxTotal: "500.00",
      codCountryScope: "some",
      codCountryCodes: ["BA"],
    });
    expect(codSettingsFormValues({ ...values, codFeeType: "FIXED_AMOUNT", codFeeValue: 0 } as never).codFee).toBe("");
  });
});
