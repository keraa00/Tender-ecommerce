import { BLANK_ADDRESS, readAddressFields, type RawAddress } from "@/lib/address/validate";

/**
 * The checkout in progress, as kept on the cart so a refresh loses nothing:
 * what the buyer has typed so far, unvalidated. Pure and dependency-free.
 *
 * Read leniently, like the theme document — it is the buyer's own typing, and
 * a draft saved by an older version of the form must still load. Nothing in
 * it is trusted: pricing validates the address before quoting, and placing
 * the order validates everything again from the form itself.
 */

export type CheckoutDraft = {
  shipping: RawAddress;
  /** False: a separate billing address, in `billing`. */
  billingSameAsShipping: boolean;
  billing: RawAddress;
  note: string;
  marketingOptIn: boolean;
};

export const BLANK_DRAFT: CheckoutDraft = {
  shipping: BLANK_ADDRESS,
  billingSameAsShipping: true,
  billing: BLANK_ADDRESS,
  note: "",
  marketingOptIn: false,
};

/** Longer than the form allows, so a draft is never cut short — only a forged one. */
const MAX_DRAFT_FIELD = 1000;
export const MAX_NOTE_LENGTH = 500;

function readRaw(value: unknown): RawAddress {
  const raw = { ...BLANK_ADDRESS };
  if (typeof value !== "object" || value === null) return raw;
  for (const name of Object.keys(raw) as (keyof RawAddress)[]) {
    const field = (value as Record<string, unknown>)[name];
    if (typeof field === "string") raw[name] = field.slice(0, MAX_DRAFT_FIELD);
  }
  return raw;
}

export function readCheckoutDraft(value: unknown): CheckoutDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return BLANK_DRAFT;
  const entry = value as Record<string, unknown>;
  return {
    shipping: readRaw(entry.shipping),
    billingSameAsShipping: entry.billingSameAsShipping !== false,
    billing: readRaw(entry.billing),
    note: typeof entry.note === "string" ? entry.note.slice(0, MAX_DRAFT_FIELD) : "",
    marketingOptIn: entry.marketingOptIn === true,
  };
}

/** The checkout form's fields, as a draft to keep on the cart. */
export function draftFromForm(formData: FormData): CheckoutDraft {
  const note = formData.get("note");
  return {
    shipping: readAddressFields(formData, "shipping"),
    // A radio: "different" means a billing address of its own.
    billingSameAsShipping: formData.get("billingAddress") !== "different",
    billing: readAddressFields(formData, "billing"),
    note: typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "",
    marketingOptIn: formData.get("marketingOptIn") !== null,
  };
}
