import * as z from "zod";

import type { PostalAddress } from "@/lib/address/types";
import {
  readAddressFields,
  validateAddress,
  type AddressErrorCode,
  type AddressRules,
} from "@/lib/address/validate";
import { isUuid } from "@/lib/ids";
import { readPaymentChoice, type PaymentChoice } from "@/lib/payments/cod";
import { MAX_NOTE_LENGTH } from "./draft";
import { CHECKOUT_MAX_LENGTH, codShippingAddressRules, type AddressPrefix } from "./fields";

/**
 * The checkout form: who is buying, where it goes, how it ships, who pays and
 * how.
 * Pure, like the other form parsers. Errors are codes rather than sentences so
 * the storefront can word them in the buyer's language.
 *
 * What it does not decide is anything that needs the store's data — whether
 * the store ships to the address, whether the rate is one of its own and
 * still applies, whether cash on delivery is offered for this order. Placing
 * the order decides those, with the cart in hand; a rate id or a payment
 * method from here is only ever a request.
 */

export type CheckoutDetails = {
  /** Lower-cased: the identity discounts and customers are keyed by. */
  email: string;
  marketingConsent: boolean;
  note: string | null;
  /** Null when nothing in the cart ships. */
  shippingAddress: PostalAddress | null;
  billingAddress: PostalAddress;
  /** The rate the buyer picked; checked against the store's on placing. */
  shippingRateId: string | null;
  /** How the buyer chose to pay; checked against what the order allows on placing. */
  paymentMethod: PaymentChoice;
  /** The total the buyer was shown, in cents; an order at any other is refused. */
  expectedTotalCents: number;
};

export type CheckoutErrorCode = AddressErrorCode | "email";

/** Keyed `email`, `note`, `shippingRate`, or `shipping.<field>` / `billing.<field>`. */
export type CheckoutFieldErrors = Partial<Record<string, CheckoutErrorCode>>;

export type ParsedCheckoutForm =
  | { ok: true; details: CheckoutDetails }
  | { ok: false; fieldErrors: CheckoutFieldErrors };

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

export function parseCheckoutForm(
  formData: FormData,
  options: {
    /** Whether anything in the cart ships — then there is a shipping address and a rate. */
    needsShipping: boolean;
    shippingRules: AddressRules;
    billingRules: AddressRules;
    /** The store's settings: a field it does not offer is ignored, not trusted. */
    orderNote: boolean;
    marketingOptIn: boolean;
    /** Whether a cash-on-delivery order must give a phone with its shipping address. */
    codRequiresPhone: boolean;
  },
): ParsedCheckoutForm {
  const fieldErrors: CheckoutFieldErrors = {};

  // A form from before there was a choice paid by card; the quote decides
  // whether the choice can stand.
  const paymentMethod = readPaymentChoice(field(formData, "paymentMethod")) ?? "stripe";
  const shippingRules =
    paymentMethod === "cod"
      ? codShippingAddressRules(options.shippingRules, options.codRequiresPhone)
      : options.shippingRules;

  const email = normalizeEmail(field(formData, "email"));
  if (email === null) fieldErrors.email = field(formData, "email") === "" ? "required" : "email";

  const address = (prefix: AddressPrefix, rules: AddressRules): PostalAddress | null => {
    const check = validateAddress(readAddressFields(formData, prefix), rules);
    if (check.ok) return check.address;
    for (const [name, code] of Object.entries(check.errors)) fieldErrors[`${prefix}.${name}`] = code;
    return null;
  };

  const shippingAddress = options.needsShipping ? address("shipping", shippingRules) : null;

  // Billing is the shipping address unless the buyer said otherwise — and,
  // with nothing to ship, the only address there is.
  const separateBilling =
    !options.needsShipping || field(formData, "billingAddress") === "different";
  const billingAddress = separateBilling
    ? address("billing", options.billingRules)
    : shippingAddress;

  let shippingRateId: string | null = null;
  if (options.needsShipping) {
    const raw = field(formData, "shippingRateId");
    if (isUuid(raw)) shippingRateId = raw;
    else fieldErrors.shippingRate = "required";
  }

  const rawNote = options.orderNote ? field(formData, "note") : "";
  if (rawNote.length > MAX_NOTE_LENGTH) fieldErrors.note = "tooLong";

  const expectedTotal = field(formData, "expectedTotal");
  // A missing total is not the buyer's to fix — the page they submitted was
  // not the checkout page. Treat it as "the total changed" upstream by
  // passing -1, which no real cart ever totals.
  const expectedTotalCents = /^\d{1,12}$/.test(expectedTotal) ? Number(expectedTotal) : -1;

  if (Object.keys(fieldErrors).length > 0 || email === null || billingAddress === null) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    details: {
      email,
      marketingConsent: options.marketingOptIn && formData.get("marketingOptIn") !== null,
      note: rawNote === "" ? null : rawNote,
      shippingAddress,
      billingAddress,
      shippingRateId,
      paymentMethod,
      expectedTotalCents,
    },
  };
}
