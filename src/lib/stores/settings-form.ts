import * as z from "zod";

import { isCountryCode } from "@/lib/address/countries";
import { isSupportedCurrency } from "@/lib/currencies";
import type { CheckoutFieldMode, CodFeeType, Store } from "@/lib/db/types";
import { formatPercent, parsePercentToBps } from "@/lib/discounts/format";
import { centsToInputValue, parseMoneyToCents } from "@/lib/money";

/**
 * Parsing for the General and Checkout settings pages, and for cash on
 * delivery under Payments. Free of `server-only` and of database access so the
 * rules are tested directly; whether the currency may still change is the
 * action's question, since it needs the store's order count.
 *
 * Every rule here has a twin CHECK in `20261006120000_checkout_shipping` or
 * `20261029130000_cash_on_delivery`. This side says what is wrong in words;
 * the constraint stops any other write path.
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

// ---------------------------------------------------------------------------
// Cash on delivery
// ---------------------------------------------------------------------------

export const COD_LABEL_MAX = 60;
export const COD_INSTRUCTIONS_MAX = 500;
/** The same ceiling as a shipping rate's price: 1,000,000.00. */
const MAX_FIXED_FEE_CENTS = 100_000_000;
const MAX_LIMIT_CENTS = 100_000_000_000;

export type CodSettingsInput = {
  codEnabled: boolean;
  codLabel: string | null;
  codInstructions: string | null;
  codFeeType: CodFeeType;
  /** Cents or basis points, by type. */
  codFeeValue: number;
  codMinTotalCents: number | null;
  codMaxTotalCents: number | null;
  /** Upper-case, sorted, no repeats. Empty: everywhere the store ships. */
  codCountryCodes: string[];
  codRequirePhone: boolean;
};

/** The form's fields as the seller edits them: strings, the way they are typed. */
export type CodFormValues = {
  codEnabled: boolean;
  codLabel: string;
  codInstructions: string;
  codFeeType: CodFeeType;
  codFee: string;
  codMinTotal: string;
  codMaxTotal: string;
  codCountryScope: "all" | "some";
  codCountryCodes: string[];
  codRequirePhone: boolean;
};

type CodColumns = Pick<
  Store,
  | "codEnabled"
  | "codLabel"
  | "codInstructions"
  | "codFeeType"
  | "codFeeValue"
  | "codMinTotalCents"
  | "codMaxTotalCents"
  | "codCountryCodes"
  | "codRequirePhone"
>;

/** What the form starts from: the saved settings, written back as typed. No fee reads blank. */
export function codSettingsFormValues(store: CodColumns): CodFormValues {
  const fee =
    store.codFeeValue === 0
      ? ""
      : store.codFeeType === "PERCENTAGE"
        ? formatPercent(store.codFeeValue)
        : centsToInputValue(store.codFeeValue);
  return {
    codEnabled: store.codEnabled,
    codLabel: store.codLabel ?? "",
    codInstructions: store.codInstructions ?? "",
    codFeeType: store.codFeeType,
    codFee: fee,
    codMinTotal: store.codMinTotalCents === null ? "" : centsToInputValue(store.codMinTotalCents),
    codMaxTotal: store.codMaxTotalCents === null ? "" : centsToInputValue(store.codMaxTotalCents),
    codCountryScope: store.codCountryCodes.length > 0 ? "some" : "all",
    codCountryCodes: [...store.codCountryCodes],
    codRequirePhone: store.codRequirePhone,
  };
}

export type CodSettingsErrors = Partial<
  Record<"codLabel" | "codInstructions" | "codFee" | "codMinTotal" | "codMaxTotal" | "codCountries", string>
>;

export type ParsedCodSettings =
  | { ok: true; settings: CodSettingsInput }
  | { ok: false; fieldErrors: CodSettingsErrors };

/** An optional amount: blank is no limit, anything else must read as money. */
function optionalCents(raw: string): number | null | undefined {
  if (raw === "") return null;
  const cents = parseMoneyToCents(raw);
  return cents === null || cents > MAX_LIMIT_CENTS ? undefined : cents;
}

/**
 * Settings → Payments → Cash on delivery. Everything is checked whether or not
 * COD is switched on, so a seller can set it up first and switch it on after.
 * The fee is one field, read as money or as a percentage by the type beside it;
 * blank means no fee.
 */
export function parseCodSettingsForm(formData: FormData): ParsedCodSettings {
  const fieldErrors: CodSettingsErrors = {};

  const label = field(formData, "codLabel");
  if (label.length > COD_LABEL_MAX) fieldErrors.codLabel = `Keep it to ${COD_LABEL_MAX} characters.`;

  const instructions = field(formData, "codInstructions");
  if (instructions.length > COD_INSTRUCTIONS_MAX) {
    fieldErrors.codInstructions = `Keep it to ${COD_INSTRUCTIONS_MAX} characters.`;
  }

  const feeType: CodFeeType = field(formData, "codFeeType") === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT";
  const rawFee = field(formData, "codFee");
  let feeValue = 0;
  if (rawFee !== "") {
    if (feeType === "PERCENTAGE") {
      const bps = parsePercentToBps(rawFee);
      if (bps === null || bps > 10_000) fieldErrors.codFee = "Enter a percentage between 0 and 100.";
      else feeValue = bps;
    } else {
      const cents = parseMoneyToCents(rawFee);
      if (cents === null || cents > MAX_FIXED_FEE_CENTS) fieldErrors.codFee = "Enter an amount, like 2.50.";
      else feeValue = cents;
    }
  }

  const min = optionalCents(field(formData, "codMinTotal"));
  const max = optionalCents(field(formData, "codMaxTotal"));
  if (min === undefined) fieldErrors.codMinTotal = "Enter an amount, or leave it blank for no minimum.";
  if (max === undefined) fieldErrors.codMaxTotal = "Enter an amount, or leave it blank for no maximum.";
  if (typeof min === "number" && typeof max === "number" && min > max) {
    fieldErrors.codMaxTotal = "The maximum can't be less than the minimum.";
  }

  let countryCodes: string[] = [];
  if (field(formData, "codCountryScope") === "some") {
    const codes = formData
      .getAll("codCountry")
      .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""));
    if (codes.some((code) => !isCountryCode(code))) {
      fieldErrors.codCountries = "Choose countries from the list.";
    } else if (codes.length === 0) {
      fieldErrors.codCountries = "Choose at least one country, or offer it everywhere you ship.";
    } else {
      countryCodes = [...new Set(codes)].sort();
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    settings: {
      // Checkboxes: present when ticked, absent otherwise.
      codEnabled: formData.get("codEnabled") !== null,
      codLabel: label === "" ? null : label,
      codInstructions: instructions === "" ? null : instructions,
      codFeeType: feeType,
      codFeeValue: feeValue,
      codMinTotalCents: min ?? null,
      codMaxTotalCents: max ?? null,
      codCountryCodes: countryCodes,
      codRequirePhone: formData.get("codRequirePhone") !== null,
    },
  };
}
