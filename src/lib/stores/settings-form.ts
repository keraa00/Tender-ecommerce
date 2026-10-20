import * as z from "zod";

import { isSupportedCurrency } from "@/lib/currencies";
import type { CheckoutFieldMode } from "@/lib/db/types";

/**
 * Parsing for the General and Checkout settings pages. Free of `server-only`
 * and of database access so the rules are tested directly; whether the
 * currency may still change is the action's question, since it needs the
 * store's order count.
 *
 * Every rule here has a twin CHECK in `20261006120000_checkout_shipping`. This
 * side says what is wrong in words; the constraint stops any other write path.
 */

const MAX_EMAIL = 254;
const email = z.email();

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

export type GeneralSettings = {
  currency: string;
  /** Lower-cased, or null to fall back to the owner's account email. */
  contactEmail: string | null;
};

export type GeneralSettingsErrors = Partial<Record<"currency" | "contactEmail", string>>;

export type ParsedGeneralSettings =
  | { ok: true; settings: GeneralSettings }
  | { ok: false; fieldErrors: GeneralSettingsErrors };

export function parseGeneralSettingsForm(formData: FormData): ParsedGeneralSettings {
  const fieldErrors: GeneralSettingsErrors = {};

  const currency = field(formData, "currency").toUpperCase();
  if (!isSupportedCurrency(currency)) fieldErrors.currency = "Choose a currency from the list.";

  const rawEmail = field(formData, "contactEmail").toLowerCase();
  let contactEmail: string | null = null;
  if (rawEmail !== "") {
    if (rawEmail.length > MAX_EMAIL || !email.safeParse(rawEmail).success) {
      fieldErrors.contactEmail = "Enter an email address like hello@yourstore.com.";
    } else {
      contactEmail = rawEmail;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, settings: { currency, contactEmail } };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export type CheckoutSettings = {
  checkoutPhone: CheckoutFieldMode;
  checkoutCompany: CheckoutFieldMode;
  checkoutFirstName: CheckoutFieldMode;
  checkoutAddress2: CheckoutFieldMode;
  checkoutMarketingOptIn: boolean;
  checkoutOrderNote: boolean;
};

export type CheckoutSettingsErrors = Partial<Record<keyof CheckoutSettings, string>>;

export type ParsedCheckoutSettings =
  | { ok: true; settings: CheckoutSettings }
  | { ok: false; fieldErrors: CheckoutSettingsErrors };

/**
 * The modes each field may take. First name is never hidden — the last name
 * is always asked for, and a parcel addressed to "Smith" alone is fine, but a
 * form that asks only for a surname reads as a mistake — and line 2 is never
 * required, because most addresses have none.
 */
export const CHECKOUT_FIELD_MODES = {
  checkoutPhone: ["HIDDEN", "OPTIONAL", "REQUIRED"],
  checkoutCompany: ["HIDDEN", "OPTIONAL", "REQUIRED"],
  checkoutFirstName: ["OPTIONAL", "REQUIRED"],
  checkoutAddress2: ["HIDDEN", "OPTIONAL"],
} as const satisfies Record<string, readonly CheckoutFieldMode[]>;

type ModeField = keyof typeof CHECKOUT_FIELD_MODES;

export function parseCheckoutSettingsForm(formData: FormData): ParsedCheckoutSettings {
  const fieldErrors: CheckoutSettingsErrors = {};
  const modes = {} as Record<ModeField, CheckoutFieldMode>;

  for (const name of Object.keys(CHECKOUT_FIELD_MODES) as ModeField[]) {
    const value = field(formData, name);
    const allowed: readonly string[] = CHECKOUT_FIELD_MODES[name];
    if (allowed.includes(value)) {
      modes[name] = value as CheckoutFieldMode;
    } else {
      fieldErrors[name] = "Choose one of the options.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    settings: {
      ...modes,
      // Checkboxes: present when ticked, absent otherwise.
      checkoutMarketingOptIn: formData.get("checkoutMarketingOptIn") !== null,
      checkoutOrderNote: formData.get("checkoutOrderNote") !== null,
    },
  };
}
