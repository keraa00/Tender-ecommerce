import type {
  CustomerSegment,
  Discount,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { FULL_DISCOUNT_BPS } from "./constants";
import { segmentLabel } from "./segments";

/**
 * Pure presentation of a discount. No database access and no `server-only`, so
 * the rules a seller sees are unit-testable and the same on both sides of the
 * wire — the form's live summary runs this in the browser, which is also why
 * only types are imported from `@/lib/db/types`.
 */

/** Basis points as a percentage: 1000 -> "10", 1250 -> "12.5". */
export function formatPercent(bps: number): string {
  const percent = bps / 100;
  // Trim the decimals when they are zero: "10% off", not "10.00% off".
  return Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/, "");
}

/**
 * "12.5" or "12.5%" as basis points — the inverse of `formatPercent`. The same
 * fixed-point read as money, two decimal places from the digits and never
 * through a float; a basis point is to a percent what a cent is to a dollar.
 */
export function parsePercentToBps(raw: string): number | null {
  const trimmed = raw.trim().replace(/%$/, "").trim();
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  return parseMoneyToCents(trimmed);
}

type ValueFields = Pick<Discount, "type" | "value"> &
  Partial<Pick<Discount, "buyQuantity" | "getQuantity">>;

/**
 * `value` means something different per type — see the note on the model. A
 * percentage is stored in basis points, so 1000 is 10%, and printing it raw is
 * how a 10% promotion is announced as 1000% off.
 */
export function formatDiscountValue(discount: ValueFields, currency: string): string {
  switch (discount.type) {
    case "PERCENTAGE":
      return `${formatPercent(discount.value)}% off`;
    case "FIXED_AMOUNT":
      return `${formatMoney(discount.value, currency)} off`;
    case "FREE_SHIPPING":
      return "Free shipping";
    case "BUY_X_GET_Y": {
      const reward =
        discount.value >= FULL_DISCOUNT_BPS
          ? "free"
          : `at ${formatPercent(discount.value)}% off`;
      return `Buy ${discount.buyQuantity ?? 1}, get ${discount.getQuantity ?? 1} ${reward}`;
    }
  }
}

export type DiscountState =
  | "active"
  | "scheduled"
  | "expired"
  | "exhausted"
  | "disabled";

type StateFields = Pick<Discount, "active" | "endsAt" | "usageLimit" | "usageCount"> & {
  startsAt: Date | null;
};

/**
 * Why a discount is or is not currently applying.
 *
 * Ordered most-deliberate first: a seller who switched a discount off wants to
 * be told that, not that it also happens to have expired last week. Dates beat
 * the usage limit for the same reason — a closed window is the fact that will
 * not change on its own.
 */
export function discountState(
  discount: StateFields,
  now: Date = new Date(),
): DiscountState {
  if (!discount.active) return "disabled";
  if (discount.startsAt && now < discount.startsAt) return "scheduled";
  if (discount.endsAt && now > discount.endsAt) return "expired";
  if (
    discount.usageLimit !== null &&
    discount.usageCount >= discount.usageLimit
  ) {
    return "exhausted";
  }
  return "active";
}

export const DISCOUNT_STATE_LABELS: Record<DiscountState, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  exhausted: "Limit reached",
  disabled: "Off",
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Everything the summary needs, with targets as counts: the list page has the
 * counts from the database and the form has them from its pickers, and neither
 * should have to build the other's shape.
 */
export type DiscountSummary = {
  type: DiscountType;
  value: number;
  appliesTo: DiscountAppliesTo;
  productCount: number;
  collectionCount: number;
  buysFrom: DiscountAppliesTo | null;
  buyProductCount: number;
  buyCollectionCount: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxUsesPerOrder: number | null;
  minSubtotalCents: number | null;
  minQuantity: number | null;
  eligibility: DiscountEligibility;
  segments: readonly CustomerSegment[];
  customerCount: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  combinable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "3 products", "1 collection", or `whole` when the scope is everything. */
function scopePhrase(
  scope: DiscountAppliesTo,
  products: number,
  collections: number,
  whole: string,
): string {
  switch (scope) {
    case "ALL":
      return whole;
    case "PRODUCT":
      return plural(products, "product");
    case "COLLECTION":
      return plural(collections, "collection");
  }
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * The discount's rules in plain sentences, one per line, in the order a seller
 * reads them: what it gives, what it needs, who gets it, how often, and when.
 */
export function describeDiscount(discount: DiscountSummary, currency: string): string[] {
  const lines: string[] = [];

  if (discount.type === "BUY_X_GET_Y") {
    const buyQuantity = discount.buyQuantity ?? 1;
    const getQuantity = discount.getQuantity ?? 1;
    const reward =
      discount.value >= FULL_DISCOUNT_BPS
        ? "free"
        : `at ${formatPercent(discount.value)}% off`;

    lines.push(
      `Buy ${plural(buyQuantity, "item")} from ${scopePhrase(
        discount.buysFrom ?? "ALL",
        discount.buyProductCount,
        discount.buyCollectionCount,
        "any product",
      )}`,
      `Get ${plural(getQuantity, "item")} ${reward} from ${scopePhrase(
        discount.appliesTo,
        discount.productCount,
        discount.collectionCount,
        "any product",
      )}`,
    );
    if (discount.maxUsesPerOrder !== null) {
      lines.push(`Up to ${plural(discount.maxUsesPerOrder, "time")} per order`);
    }
  } else if (discount.type === "FREE_SHIPPING") {
    lines.push("Free shipping on the order");
  } else {
    lines.push(
      `${formatDiscountValue(discount, currency)} ${scopePhrase(
        discount.appliesTo,
        discount.productCount,
        discount.collectionCount,
        "the entire order",
      )}`,
    );
    if (discount.type === "FIXED_AMOUNT" && discount.appliesTo !== "ALL") {
      lines.push("Taken once per order, across the matching items");
    }
  }

  if (discount.type !== "BUY_X_GET_Y") {
    if (discount.minSubtotalCents !== null) {
      lines.push(`Minimum purchase of ${formatMoney(discount.minSubtotalCents, currency)}`);
    } else if (discount.minQuantity !== null) {
      lines.push(`Minimum of ${plural(discount.minQuantity, "item")}`);
    } else {
      lines.push("No minimum purchase");
    }
  }

  if (discount.eligibility === "SEGMENTS" && discount.segments.length > 0) {
    lines.push(
      `For ${joinOr(discount.segments.map((segment) => segmentLabel(segment).toLowerCase()))}`,
    );
  } else if (discount.eligibility === "CUSTOMERS") {
    lines.push(`For ${plural(discount.customerCount, "specific customer")}`);
  } else {
    lines.push("For all customers");
  }

  const limits: string[] = [];
  if (discount.usageLimit !== null) {
    limits.push(`Limited to ${plural(discount.usageLimit, "use")} in total`);
  }
  if (discount.perCustomerLimit !== null) {
    limits.push(
      discount.perCustomerLimit === 1
        ? "One use per customer"
        : `${plural(discount.perCustomerLimit, "use")} per customer`,
    );
  }
  lines.push(...(limits.length > 0 ? limits : ["No usage limits"]));

  lines.push(
    discount.combinable
      ? "Combines with other discounts"
      : "Can't be combined with other discounts",
  );

  const window = describeWindow(discount.startsAt, discount.endsAt);
  if (window) lines.push(window);

  return lines;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "1 Jun 2026, 09:00" in UTC, spelled out by hand rather than through `Intl`.
 * The form's summary renders on the server and again in the browser, and ICU
 * builds disagree on month abbreviations ("Sep" or "Sept") — a hydration
 * mismatch waiting for the first seller on the other engine.
 */
export function formatUtcDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** "From 1 Jun 2026, 09:00 UTC", "… until …", or null when open-ended. */
export function describeWindow(startsAt: Date | null, endsAt: Date | null): string | null {
  if (startsAt && endsAt) {
    return `From ${formatUtcDateTime(startsAt)} until ${formatUtcDateTime(endsAt)} UTC`;
  }
  if (startsAt) return `From ${formatUtcDateTime(startsAt)} UTC`;
  if (endsAt) return `Until ${formatUtcDateTime(endsAt)} UTC`;
  return null;
}
