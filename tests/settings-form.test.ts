import { describe, expect, it } from "vitest";

import { parseCheckoutSettingsForm, parseGeneralSettingsForm } from "@/lib/stores/settings-form";

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
