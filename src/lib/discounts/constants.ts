import type {
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";

/**
 * Limits and choices shared by the discount form, its parser, the pricing
 * engine and the admin pages.
 *
 * Only *types* come from `@/lib/db/types`: its values re-export the generated
 * Prisma client, which must not reach the browser bundle (see the note in
 * `lib/products/constants.ts`). The enums are string unions, so the literals
 * below are checked against them, and the labels in the admin messages are
 * `Record<Enum, …>`s that fail to compile the day a value is added to the
 * schema without one.
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

/*
 * The choices the form offers, in the order it lists them. What each is called
 * is the admin's copy — `t.discounts.types`, `.scopes`, `.buysFrom`,
 * `.minimums` and `.eligibilities` — in the seller's language.
 */

export const DISCOUNT_TYPES: readonly DiscountType[] = [
  "PERCENTAGE",
  "FIXED_AMOUNT",
  "BUY_X_GET_Y",
  "FREE_SHIPPING",
];

export const DISCOUNT_SCOPES: readonly DiscountAppliesTo[] = ["ALL", "PRODUCT", "COLLECTION"];

export type DiscountMinimum = "NONE" | "SUBTOTAL" | "QUANTITY";

export const DISCOUNT_MINIMUMS: readonly DiscountMinimum[] = ["NONE", "SUBTOTAL", "QUANTITY"];

export const DISCOUNT_ELIGIBILITIES: readonly DiscountEligibility[] = [
  "ALL",
  "SEGMENTS",
  "CUSTOMERS",
];
