import type {
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";

/**
 * Limits and labels shared by the discount form, its parser, the pricing
 * engine and the admin pages.
 *
 * Only *types* come from `@/lib/db/types`: its values re-export the generated
 * Prisma client, which must not reach the browser bundle (see the note in
 * `lib/products/constants.ts`). The enums are string unions, so the literals
 * below are checked against them, and each `Record<Enum, …>` fails to compile
 * the day a value is added to the schema without a label here.
 */

export const DISCOUNT_CODE_MIN_LENGTH = 3;
export const DISCOUNT_CODE_MAX_LENGTH = 32;
export const MAX_DISCOUNT_TITLE = 120;
/** Products or collections on one side of one discount. */
export const MAX_DISCOUNT_TARGETS = 500;
export const MAX_DISCOUNT_CUSTOMERS = 1_000;
/** Buy and get quantities. A cart line tops out at 99, so this is generous. */
export const MAX_BXGY_QUANTITY = 100;
export const MAX_MINIMUM_QUANTITY = 10_000;
/** Well above any real order, and clear of integer overflow. */
export const MAX_DISCOUNT_CENTS = 100_000_000;
export const MAX_USAGE_LIMIT = 1_000_000_000;

/** 100% in basis points — a buy-X-get-Y at this value gives the items away. */
export const FULL_DISCOUNT_BPS = 10_000;

type Option<T extends string> = { value: T; label: string; hint: string };

const TYPE_TEXT: Record<DiscountType, { label: string; hint: string }> = {
  PERCENTAGE: {
    label: "Percentage",
    hint: "A share off selected items or the whole order.",
  },
  FIXED_AMOUNT: {
    label: "Fixed amount",
    hint: "A set amount off, once per order.",
  },
  BUY_X_GET_Y: {
    label: "Buy X get Y",
    hint: "Buy some items, get others free or reduced.",
  },
  FREE_SHIPPING: {
    label: "Free shipping",
    hint: "Waives the shipping charge.",
  },
};

export const DISCOUNT_TYPE_OPTIONS: readonly Option<DiscountType>[] = (
  ["PERCENTAGE", "FIXED_AMOUNT", "BUY_X_GET_Y", "FREE_SHIPPING"] as const
).map((value) => ({ value, ...TYPE_TEXT[value] }));

export function discountTypeLabel(type: DiscountType): string {
  return TYPE_TEXT[type].label;
}

const SCOPE_TEXT: Record<DiscountAppliesTo, string> = {
  ALL: "Entire order",
  PRODUCT: "Specific products",
  COLLECTION: "Specific collections",
};

export const APPLIES_TO_OPTIONS: readonly { value: DiscountAppliesTo; label: string }[] = (
  ["ALL", "PRODUCT", "COLLECTION"] as const
).map((value) => ({ value, label: SCOPE_TEXT[value] }));

/** The same three scopes, worded for the "customer buys" side of a BXGY. */
export const BUYS_FROM_OPTIONS: readonly { value: DiscountAppliesTo; label: string }[] = [
  { value: "ALL", label: "Any items" },
  { value: "PRODUCT", label: "Specific products" },
  { value: "COLLECTION", label: "Specific collections" },
];

export type DiscountMinimum = "NONE" | "SUBTOTAL" | "QUANTITY";

export const MINIMUM_OPTIONS: readonly { value: DiscountMinimum; label: string }[] = [
  { value: "NONE", label: "No minimum" },
  { value: "SUBTOTAL", label: "Minimum purchase amount" },
  { value: "QUANTITY", label: "Minimum quantity of items" },
];

const ELIGIBILITY_TEXT: Record<DiscountEligibility, string> = {
  ALL: "All customers",
  SEGMENTS: "Customer segments",
  CUSTOMERS: "Specific customers",
};

export const ELIGIBILITY_OPTIONS: readonly { value: DiscountEligibility; label: string }[] = (
  ["ALL", "SEGMENTS", "CUSTOMERS"] as const
).map((value) => ({ value, label: ELIGIBILITY_TEXT[value] }));
