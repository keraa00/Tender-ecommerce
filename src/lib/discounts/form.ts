import * as z from "zod";

import type {
  CustomerSegment,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";
import { parseDateTimeInput } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { parseMoneyToCents } from "@/lib/money";
import {
  DISCOUNT_CODE_MAX_LENGTH,
  DISCOUNT_CODE_MIN_LENGTH,
  FULL_DISCOUNT_BPS,
  MAX_BXGY_QUANTITY,
  MAX_DISCOUNT_CENTS,
  MAX_DISCOUNT_CUSTOMERS,
  MAX_DISCOUNT_TARGETS,
  MAX_DISCOUNT_TITLE,
  MAX_MINIMUM_QUANTITY,
  MAX_USAGE_LIMIT,
} from "./constants";
import { parsePercentToBps } from "./format";
import { isCustomerSegment } from "./segments";

export { parsePercentToBps };

/**
 * Parsing and validation for the discount form. Free of `server-only` and of
 * database access so the rules can be unit-tested directly — whether the
 * product and collection ids belong to the store is checked by the action.
 *
 * Every rule here has a twin CHECK constraint in migration
 * `20260926160000_discount_rules`. This side exists to say what is wrong in
 * words; the constraint exists so no other write path can skip it. Fields that
 * do not apply to the chosen type are dropped rather than rejected, because the
 * form keeps them around while the seller flips between types — so the draft
 * that comes out always has the shape the constraints expect.
 */

export type DiscountDraft = {
  /** Upper-case, or null for an automatic discount. */
  code: string | null;
  title: string;
  type: DiscountType;
  /** Basis points, cents, or 0 — see the note on the Discount model. */
  value: number;
  appliesTo: DiscountAppliesTo;
  /** DISCOUNTED targets, meaningful only for the matching `appliesTo`. */
  productIds: string[];
  collectionIds: string[];
  buysFrom: DiscountAppliesTo | null;
  /** QUALIFYING targets, meaningful only for the matching `buysFrom`. */
  buyProductIds: string[];
  buyCollectionIds: string[];
  buyQuantity: number | null;
  getQuantity: number | null;
  maxUsesPerOrder: number | null;
  minSubtotalCents: number | null;
  minQuantity: number | null;
  eligibility: DiscountEligibility;
  segments: CustomerSegment[];
  /** Lower-cased and de-duplicated. */
  customerEmails: string[];
  usageLimit: number | null;
  perCustomerLimit: number | null;
  combinable: boolean;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
};

export type DiscountFieldErrors = Partial<
  Record<
    | "code"
    | "title"
    | "type"
    | "value"
    | "appliesTo"
    | "buysFrom"
    | "buyQuantity"
    | "getQuantity"
    | "maxUsesPerOrder"
    | "minimum"
    | "eligibility"
    | "usageLimit"
    | "perCustomerLimit"
    | "startsAt"
    | "endsAt",
    string
  >
>;

export type ParsedDiscountForm =
  | { ok: true; draft: DiscountDraft }
  | { ok: false; fieldErrors: DiscountFieldErrors };

const TYPES = ["PERCENTAGE", "FIXED_AMOUNT", "BUY_X_GET_Y", "FREE_SHIPPING"] as const;
const SCOPES = ["ALL", "PRODUCT", "COLLECTION"] as const;
const ELIGIBILITIES = ["ALL", "SEGMENTS", "CUSTOMERS"] as const;

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
const email = z.email();

/**
 * How a code is compared, everywhere: trimmed and upper-case. Checkout runs
 * what a buyer types through this too, so `welcome10` finds `WELCOME10`.
 */
export function normalizeDiscountCode(input: string): string {
  return input.trim().toUpperCase();
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function column(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Distinct, well-formed uuids in the order given. */
function ids(formData: FormData, name: string): string[] {
  return [...new Set(column(formData, name).map((id) => id.trim()).filter(isUuid))];
}

/** A whole number within bounds, or null. Blank is null too — callers decide. */
function parseCount(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,10}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/** Emails may arrive one per field or pasted as a list; both are accepted. */
function parseEmails(formData: FormData): { emails: string[]; invalid: string | null } {
  const emails = new Set<string>();
  let invalid: string | null = null;

  for (const entry of column(formData, "customerEmail")) {
    for (const part of entry.split(/[\s,;]+/)) {
      const candidate = part.trim().toLowerCase();
      if (candidate === "") continue;
      if (!email.safeParse(candidate).success) {
        invalid ??= part.trim();
        continue;
      }
      emails.add(candidate);
    }
  }

  return { emails: [...emails], invalid };
}

type ScopeResult = { productIds: string[]; collectionIds: string[]; error?: string };

/** The targets for one side, checked against the scope that side chose. */
function parseScope(
  scope: DiscountAppliesTo,
  productIds: string[],
  collectionIds: string[],
  noun: { products: string; collections: string },
): ScopeResult {
  if (scope === "PRODUCT") {
    if (productIds.length === 0) return { productIds, collectionIds: [], error: noun.products };
    if (productIds.length > MAX_DISCOUNT_TARGETS) {
      return { productIds, collectionIds: [], error: `Choose at most ${MAX_DISCOUNT_TARGETS} products.` };
    }
    return { productIds, collectionIds: [] };
  }

  if (scope === "COLLECTION") {
    if (collectionIds.length === 0) {
      return { productIds: [], collectionIds, error: noun.collections };
    }
    if (collectionIds.length > MAX_DISCOUNT_TARGETS) {
      return {
        productIds: [],
        collectionIds,
        error: `Choose at most ${MAX_DISCOUNT_TARGETS} collections.`,
      };
    }
    return { productIds: [], collectionIds };
  }

  // A whole-order scope keeps no targets, whatever the hidden pickers held.
  return { productIds: [], collectionIds: [] };
}

export function parseDiscountForm(
  formData: FormData,
  /** Fills in a blank start date. Injected so tests do not depend on the clock. */
  now: Date = new Date(),
): ParsedDiscountForm {
  const errors: DiscountFieldErrors = {};

  // --- Method: a code the buyer types, or automatic -------------------------

  const automatic = field(formData, "method") === "automatic";
  let code: string | null = null;

  if (!automatic) {
    code = normalizeDiscountCode(field(formData, "code"));
    if (code === "") {
      errors.code = "Enter a code for buyers to type at checkout.";
    } else if (code.length < DISCOUNT_CODE_MIN_LENGTH || code.length > DISCOUNT_CODE_MAX_LENGTH) {
      errors.code = `Use ${DISCOUNT_CODE_MIN_LENGTH} to ${DISCOUNT_CODE_MAX_LENGTH} characters.`;
    } else if (!CODE_PATTERN.test(code)) {
      errors.code = "Use letters, numbers, hyphens and underscores only — no spaces.";
    }
  }

  // A code discount can go by its code; an automatic one is announced to the
  // buyer by its title, so it needs one.
  let title = field(formData, "title").trim();
  if (title === "" && code && !errors.code) title = code;
  if (title === "") {
    errors.title = automatic
      ? "Give the discount a title. Buyers see it at checkout."
      : "Give the discount a title.";
  } else if (title.length > MAX_DISCOUNT_TITLE) {
    errors.title = `Keep the title under ${MAX_DISCOUNT_TITLE} characters.`;
  }

  // --- Type and value -------------------------------------------------------

  const rawType = field(formData, "type");
  const type = oneOf<DiscountType>(rawType, TYPES, "PERCENTAGE");
  if (rawType !== "" && rawType !== type) errors.type = "Choose a discount type.";

  let value = 0;

  if (type === "PERCENTAGE") {
    const bps = parsePercentToBps(field(formData, "percentValue"));
    if (bps === null || bps < 1 || bps > FULL_DISCOUNT_BPS) {
      errors.value = "Enter a percentage between 0.01 and 100.";
    } else {
      value = bps;
    }
  } else if (type === "FIXED_AMOUNT") {
    const cents = parseMoneyToCents(field(formData, "amountValue"));
    if (cents === null || cents < 1) {
      errors.value = "Enter an amount like 10.00.";
    } else if (cents > MAX_DISCOUNT_CENTS) {
      errors.value = "That amount is too large.";
    } else {
      value = cents;
    }
  } else if (type === "BUY_X_GET_Y") {
    if (field(formData, "getDiscount") === "percentage") {
      const bps = parsePercentToBps(field(formData, "getPercent"));
      if (bps === null || bps < 1 || bps > FULL_DISCOUNT_BPS) {
        errors.value = "Enter a percentage between 0.01 and 100.";
      } else {
        value = bps;
      }
    } else {
      value = FULL_DISCOUNT_BPS;
    }
  }

  // --- What the discount applies to (for BXGY: what the buyer gets) ---------

  const appliesTo =
    type === "FREE_SHIPPING"
      ? "ALL"
      : oneOf<DiscountAppliesTo>(field(formData, "appliesTo"), SCOPES, "ALL");

  const discounted = parseScope(
    appliesTo,
    ids(formData, "productId"),
    ids(formData, "collectionId"),
    type === "BUY_X_GET_Y"
      ? {
          products: "Choose at least one product the customer gets.",
          collections: "Choose at least one collection the customer gets from.",
        }
      : {
          products: "Choose at least one product.",
          collections: "Choose at least one collection.",
        },
  );
  if (discounted.error) errors.appliesTo = discounted.error;

  // --- Buy X get Y ----------------------------------------------------------

  let buysFrom: DiscountAppliesTo | null = null;
  let qualifying: ScopeResult = { productIds: [], collectionIds: [] };
  let buyQuantity: number | null = null;
  let getQuantity: number | null = null;
  let maxUsesPerOrder: number | null = null;

  if (type === "BUY_X_GET_Y") {
    buysFrom = oneOf<DiscountAppliesTo>(field(formData, "buysFrom"), SCOPES, "ALL");
    qualifying = parseScope(
      buysFrom,
      ids(formData, "buyProductId"),
      ids(formData, "buyCollectionId"),
      {
        products: "Choose at least one product the customer buys.",
        collections: "Choose at least one collection the customer buys from.",
      },
    );
    if (qualifying.error) errors.buysFrom = qualifying.error;

    buyQuantity = parseCount(field(formData, "buyQuantity"), 1, MAX_BXGY_QUANTITY);
    if (buyQuantity === null) {
      errors.buyQuantity = `Enter how many items to buy, from 1 to ${MAX_BXGY_QUANTITY}.`;
    }

    getQuantity = parseCount(field(formData, "getQuantity"), 1, MAX_BXGY_QUANTITY);
    if (getQuantity === null) {
      errors.getQuantity = `Enter how many items they get, from 1 to ${MAX_BXGY_QUANTITY}.`;
    }

    if (checked(formData, "limitUsesPerOrder")) {
      maxUsesPerOrder = parseCount(field(formData, "maxUsesPerOrder"), 1, MAX_BXGY_QUANTITY);
      if (maxUsesPerOrder === null) {
        errors.maxUsesPerOrder = `Enter a number from 1 to ${MAX_BXGY_QUANTITY}.`;
      }
    }
  }

  // --- Minimum requirement (BXGY's buy quantity is its own) -----------------

  let minSubtotalCents: number | null = null;
  let minQuantity: number | null = null;

  if (type !== "BUY_X_GET_Y") {
    const minimum = field(formData, "minimum");

    if (minimum === "SUBTOTAL") {
      minSubtotalCents = parseMoneyToCents(field(formData, "minSubtotal"));
      if (minSubtotalCents === null || minSubtotalCents < 1) {
        errors.minimum = "Enter a minimum purchase amount like 50.00.";
      } else if (minSubtotalCents > MAX_DISCOUNT_CENTS) {
        errors.minimum = "That amount is too large.";
      }
    } else if (minimum === "QUANTITY") {
      minQuantity = parseCount(field(formData, "minQuantity"), 1, MAX_MINIMUM_QUANTITY);
      if (minQuantity === null) {
        errors.minimum = `Enter a minimum quantity from 1 to ${MAX_MINIMUM_QUANTITY}.`;
      }
    }
  }

  // --- Customer eligibility -------------------------------------------------

  const eligibility = oneOf<DiscountEligibility>(
    field(formData, "eligibility"),
    ELIGIBILITIES,
    "ALL",
  );
  let segments: CustomerSegment[] = [];
  let customerEmails: string[] = [];

  if (eligibility === "SEGMENTS") {
    segments = [...new Set(column(formData, "segment").filter(isCustomerSegment))];
    if (segments.length === 0) errors.eligibility = "Choose at least one segment.";
  } else if (eligibility === "CUSTOMERS") {
    const parsed = parseEmails(formData);
    customerEmails = parsed.emails;

    if (parsed.invalid !== null) {
      errors.eligibility = `"${parsed.invalid}" is not an email address.`;
    } else if (customerEmails.length === 0) {
      errors.eligibility = "Add at least one customer.";
    } else if (customerEmails.length > MAX_DISCOUNT_CUSTOMERS) {
      errors.eligibility = `Add at most ${MAX_DISCOUNT_CUSTOMERS} customers.`;
    }
  }

  // --- Usage limits ---------------------------------------------------------

  let usageLimit: number | null = null;
  if (checked(formData, "limitTotalUses")) {
    usageLimit = parseCount(field(formData, "usageLimit"), 1, MAX_USAGE_LIMIT);
    if (usageLimit === null) errors.usageLimit = "Enter how many times it can be used, 1 or more.";
  }

  let perCustomerLimit: number | null = null;
  if (checked(formData, "limitPerCustomer")) {
    perCustomerLimit = parseCount(field(formData, "perCustomerLimit"), 1, MAX_USAGE_LIMIT);
    if (perCustomerLimit === null) {
      errors.perCustomerLimit = "Enter how many times each customer can use it, 1 or more.";
    }
  }

  // --- Schedule -------------------------------------------------------------

  const rawStart = field(formData, "startsAt");
  let startsAt: Date | null = now;
  if (rawStart.trim() !== "") {
    startsAt = parseDateTimeInput(rawStart);
    if (!startsAt) errors.startsAt = "Enter a valid start date and time.";
  }

  let endsAt: Date | null = null;
  if (checked(formData, "hasEndDate")) {
    endsAt = parseDateTimeInput(field(formData, "endsAt"));
    if (!endsAt) {
      errors.endsAt = "Enter a valid end date and time.";
    } else if (startsAt && endsAt <= startsAt) {
      errors.endsAt = "The end has to come after the start.";
    }
  }

  if (Object.values(errors).some((message) => message !== undefined) || !startsAt) {
    return { ok: false, fieldErrors: errors };
  }

  return {
    ok: true,
    draft: {
      code,
      title,
      type,
      value,
      appliesTo,
      productIds: discounted.productIds,
      collectionIds: discounted.collectionIds,
      buysFrom,
      buyProductIds: qualifying.productIds,
      buyCollectionIds: qualifying.collectionIds,
      buyQuantity,
      getQuantity,
      maxUsesPerOrder,
      minSubtotalCents,
      minQuantity,
      eligibility,
      segments,
      customerEmails,
      usageLimit,
      perCustomerLimit,
      combinable: checked(formData, "combinable"),
      startsAt,
      endsAt,
      active: checked(formData, "active"),
    },
  };
}
