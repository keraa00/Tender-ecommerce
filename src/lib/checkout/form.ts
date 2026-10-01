import * as z from "zod";

import { CHECKOUT_MAX_LENGTH, type CheckoutField } from "./fields";

export type { CheckoutField };

/**
 * The checkout form: who is buying and where it goes. Pure, like the other form
 * parsers. Errors are codes rather than sentences so the storefront can word
 * them in the buyer's language.
 */

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
};

export type CheckoutDetails = {
  /** Lower-cased: the identity discounts and customers are keyed by. */
  email: string;
  address: ShippingAddress;
  /** The total the buyer was shown, in cents; an order at any other is refused. */
  expectedTotalCents: number;
};

export type CheckoutFieldErrors = Partial<Record<CheckoutField, "required" | "email" | "tooLong">>;

export type ParsedCheckoutForm =
  | { ok: true; details: CheckoutDetails }
  | { ok: false; fieldErrors: CheckoutFieldErrors };

const OPTIONAL: ReadonlySet<CheckoutField> = new Set(["address2", "region"]);
const emailSchema = z.email();

/** Lower-cased and trimmed, or null when it is not an email address. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= CHECKOUT_MAX_LENGTH.email && emailSchema.safeParse(email).success
    ? email
    : null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseCheckoutForm(formData: FormData): ParsedCheckoutForm {
  const values = {} as Record<CheckoutField, string>;
  const fieldErrors: CheckoutFieldErrors = {};

  for (const name of Object.keys(CHECKOUT_MAX_LENGTH) as CheckoutField[]) {
    // Collapse runs of whitespace: an address is printed on a label, not
    // parsed, and stray newlines from a paste do not belong on it.
    const value = field(formData, name).replace(/\s+/g, " ");
    values[name] = value;

    if (value === "" && !OPTIONAL.has(name)) fieldErrors[name] = "required";
    else if (value.length > CHECKOUT_MAX_LENGTH[name]) fieldErrors[name] = "tooLong";
  }

  const email = normalizeEmail(values.email);
  if (!fieldErrors.email && email === null) fieldErrors.email = "email";

  const expectedTotal = field(formData, "expectedTotal");
  const expectedTotalCents = /^\d{1,12}$/.test(expectedTotal) ? Number(expectedTotal) : null;

  // A missing total is not the buyer's to fix — the page they submitted was
  // not the checkout page. Treat it as "the total changed" upstream by
  // passing -1, which no real cart ever totals.
  if (Object.keys(fieldErrors).length > 0 || email === null) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    details: {
      email,
      address: {
        name: values.name,
        line1: values.address1,
        line2: values.address2 || null,
        city: values.city,
        region: values.region || null,
        postalCode: values.postalCode,
        country: values.country,
      },
      expectedTotalCents: expectedTotalCents ?? -1,
    },
  };
}
