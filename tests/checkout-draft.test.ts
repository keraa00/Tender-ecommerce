import { describe, expect, it } from "vitest";

import { BLANK_DRAFT, draftFromForm, readCheckoutDraft, savedDraft } from "@/lib/checkout/draft";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

describe("readCheckoutDraft", () => {
  it("reads nothing as a blank draft, not saving anything", () => {
    expect(readCheckoutDraft(null)).toEqual(BLANK_DRAFT);
    expect(BLANK_DRAFT.saveInfo).toBe(false);
  });

  it("reads the save box only when it is literally true", () => {
    expect(readCheckoutDraft({ saveInfo: true }).saveInfo).toBe(true);
    expect(readCheckoutDraft({ saveInfo: "yes" }).saveInfo).toBe(false);
    // Drafts saved before the box existed.
    expect(readCheckoutDraft({ note: "Hi" }).saveInfo).toBe(false);
  });
});

describe("draftFromForm", () => {
  it("reads the save box as ticked when it is posted", () => {
    expect(draftFromForm(form({ saveInfo: "on" })).saveInfo).toBe(true);
    expect(draftFromForm(form({})).saveInfo).toBe(false);
  });
});

describe("savedDraft", () => {
  it("keeps the addresses and the way of paying, not the note or the opt-in", () => {
    const draft = draftFromForm(
      form({
        "shipping.countryCode": "BA",
        "shipping.firstName": "Amra",
        "shipping.line1": "Ferhadija 12",
        "shipping.phone": "+387 61 123 456",
        billingAddress: "different",
        "billing.countryCode": "HR",
        "billing.line1": "Ilica 1",
        note: "Leave it with the neighbour",
        marketingOptIn: "on",
        paymentMethod: "cod",
      }),
    );

    const saved = savedDraft(draft);
    expect(saved).toMatchObject({
      shipping: { countryCode: "BA", firstName: "Amra", line1: "Ferhadija 12", phone: "+387 61 123 456" },
      billingSameAsShipping: false,
      billing: { countryCode: "HR", line1: "Ilica 1" },
      paymentMethod: "cod",
      note: "",
      marketingOptIn: false,
      saveInfo: true,
    });
    // And reads back the same, as checkout will.
    expect(readCheckoutDraft(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
});
