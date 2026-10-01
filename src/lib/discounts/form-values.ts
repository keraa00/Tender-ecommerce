import type {
  CustomerSegment,
  Discount,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";
import { toDateTimeInputValue } from "@/lib/dates";
import { centsToInputValue } from "@/lib/money";
import { FULL_DISCOUNT_BPS, type DiscountMinimum } from "./constants";
import { formatPercent } from "./format";

/**
 * What the discount form holds while a seller edits it: every input as the
 * string or flag it shows, for every type at once, so flipping between types
 * does not throw away what was typed. `parseDiscountForm` turns the submitted
 * version back into a draft and drops whatever the chosen type does not use.
 *
 * Kept out of the component file so the pages — Server Components — can build
 * initial values; a function exported from a `"use client"` module is only a
 * reference on the server, not something it can call.
 */
export type DiscountFormValues = {
  method: "code" | "automatic";
  code: string;
  title: string;
  type: DiscountType;
  percentValue: string;
  amountValue: string;
  getDiscount: "free" | "percentage";
  getPercent: string;
  appliesTo: DiscountAppliesTo;
  productIds: string[];
  collectionIds: string[];
  buysFrom: DiscountAppliesTo;
  buyProductIds: string[];
  buyCollectionIds: string[];
  buyQuantity: string;
  getQuantity: string;
  limitUsesPerOrder: boolean;
  maxUsesPerOrder: string;
  minimum: DiscountMinimum;
  minSubtotal: string;
  minQuantity: string;
  eligibility: DiscountEligibility;
  segments: CustomerSegment[];
  customerEmails: string[];
  limitTotalUses: boolean;
  usageLimit: string;
  limitPerCustomer: boolean;
  perCustomerLimit: string;
  combinable: boolean;
  startsAt: string;
  hasEndDate: boolean;
  endsAt: string;
  active: boolean;
};

/** A new discount: 10% off everything, for everyone, from now, switched on. */
export function blankDiscountFormValues(now: Date): DiscountFormValues {
  return {
    method: "code",
    code: "",
    title: "",
    type: "PERCENTAGE",
    percentValue: "10",
    amountValue: "",
    getDiscount: "free",
    getPercent: "50",
    appliesTo: "ALL",
    productIds: [],
    collectionIds: [],
    buysFrom: "ALL",
    buyProductIds: [],
    buyCollectionIds: [],
    buyQuantity: "2",
    getQuantity: "1",
    limitUsesPerOrder: false,
    maxUsesPerOrder: "1",
    minimum: "NONE",
    minSubtotal: "",
    minQuantity: "",
    eligibility: "ALL",
    segments: [],
    customerEmails: [],
    limitTotalUses: false,
    usageLimit: "100",
    limitPerCustomer: false,
    perCustomerLimit: "1",
    combinable: false,
    startsAt: toDateTimeInputValue(now),
    hasEndDate: false,
    endsAt: "",
    active: true,
  };
}

type SavedDiscount = Pick<
  Discount,
  | "code"
  | "title"
  | "type"
  | "value"
  | "appliesTo"
  | "buysFrom"
  | "buyQuantity"
  | "getQuantity"
  | "maxUsesPerOrder"
  | "minSubtotalCents"
  | "minQuantity"
  | "eligibility"
  | "segments"
  | "usageLimit"
  | "perCustomerLimit"
  | "combinable"
  | "startsAt"
  | "endsAt"
  | "active"
>;

/** A saved discount, as the form shows it. */
export function savedDiscountFormValues(
  discount: SavedDiscount,
  links: {
    productIds: string[];
    collectionIds: string[];
    buyProductIds: string[];
    buyCollectionIds: string[];
    customerEmails: string[];
  },
): DiscountFormValues {
  // Start from the blank form so the fields this type does not use still hold
  // sensible values if the seller switches type.
  const blank = blankDiscountFormValues(discount.startsAt);
  const isBxgy = discount.type === "BUY_X_GET_Y";

  return {
    ...blank,
    ...links,
    method: discount.code === null ? "automatic" : "code",
    code: discount.code ?? "",
    title: discount.title,
    type: discount.type,
    percentValue:
      discount.type === "PERCENTAGE" ? formatPercent(discount.value) : blank.percentValue,
    amountValue:
      discount.type === "FIXED_AMOUNT" ? centsToInputValue(discount.value) : blank.amountValue,
    getDiscount: isBxgy && discount.value < FULL_DISCOUNT_BPS ? "percentage" : "free",
    getPercent:
      isBxgy && discount.value < FULL_DISCOUNT_BPS
        ? formatPercent(discount.value)
        : blank.getPercent,
    appliesTo: discount.appliesTo,
    buysFrom: discount.buysFrom ?? "ALL",
    buyQuantity: String(discount.buyQuantity ?? blank.buyQuantity),
    getQuantity: String(discount.getQuantity ?? blank.getQuantity),
    limitUsesPerOrder: discount.maxUsesPerOrder !== null,
    maxUsesPerOrder: String(discount.maxUsesPerOrder ?? blank.maxUsesPerOrder),
    minimum:
      discount.minSubtotalCents !== null
        ? "SUBTOTAL"
        : discount.minQuantity !== null
          ? "QUANTITY"
          : "NONE",
    minSubtotal:
      discount.minSubtotalCents !== null ? centsToInputValue(discount.minSubtotalCents) : "",
    minQuantity: discount.minQuantity !== null ? String(discount.minQuantity) : "",
    eligibility: discount.eligibility,
    segments: [...discount.segments],
    limitTotalUses: discount.usageLimit !== null,
    usageLimit: String(discount.usageLimit ?? blank.usageLimit),
    limitPerCustomer: discount.perCustomerLimit !== null,
    perCustomerLimit: String(discount.perCustomerLimit ?? blank.perCustomerLimit),
    combinable: discount.combinable,
    startsAt: toDateTimeInputValue(discount.startsAt),
    hasEndDate: discount.endsAt !== null,
    endsAt: discount.endsAt ? toDateTimeInputValue(discount.endsAt) : "",
    active: discount.active,
  };
}
