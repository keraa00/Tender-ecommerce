import type {
  CustomerSegment,
  Discount,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";
import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { FULL_DISCOUNT_BPS } from "./constants";

/**
 * Pure presentation of a discount. No database access and no `server-only`, so
 * the rules a seller sees are unit-testable and the same on both sides of the
 * wire — the form's live summary runs this in the browser, which is also why
 * only types are imported from `@/lib/db/types`.
 *
 * Everything is worded in the seller's admin language, from the copy passed in
 * as `DiscountFormat`.
 */

export type DiscountFormat = {
  locale: Locale;
  /** The BCP 47 tag for money and percentages. */
  intl: string;
  t: AdminMessages["discountFormat"];
  segments: AdminMessages["segments"];
};

/** Basis points as a percentage: 1000 -> "10", 1250 -> "12.5". For inputs. */
export function formatPercent(bps: number): string {
  const percent = bps / 100;
  // Trim the decimals when they are zero: "10% off", not "10.00% off".
  return Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/, "");
}

/** Basis points as a percentage for reading: "12.5%", or "12,5 %" in German. */
export function formatPercentLabel(bps: number, intl: string): string {
  return new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 2 }).format(
    bps / 10_000,
  );
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

/** "free", or "at 50% off", for what a buy-X-get-Y gives. */
function reward(value: number, { intl, t }: DiscountFormat): string {
  return value >= FULL_DISCOUNT_BPS
    ? t.rewardFree
    : format(t.rewardPercent, { percent: formatPercentLabel(value, intl) });
}

/**
 * `value` means something different per type — see the note on the model. A
 * percentage is stored in basis points, so 1000 is 10%, and printing it raw is
 * how a 10% promotion is announced as 1000% off.
 */
export function formatDiscountValue(
  discount: ValueFields,
  currency: string,
  f: DiscountFormat,
): string {
  const { intl, t } = f;
  switch (discount.type) {
    case "PERCENTAGE":
      return format(t.percentOff, { percent: formatPercentLabel(discount.value, intl) });
    case "FIXED_AMOUNT":
      return format(t.amountOff, { amount: formatMoney(discount.value, currency, intl) });
    case "FREE_SHIPPING":
      return t.freeShipping;
    case "BUY_X_GET_Y": {
      const number = new Intl.NumberFormat(intl);
      return format(t.buyGet, {
        buy: number.format(discount.buyQuantity ?? 1),
        get: number.format(discount.getQuantity ?? 1),
        reward: reward(discount.value, f),
      });
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

/** "3 products", "1 collection", or `whole` when the scope is everything. */
function scopePhrase(
  scope: DiscountAppliesTo,
  products: number,
  collections: number,
  whole: string,
  { locale, t }: DiscountFormat,
): string {
  switch (scope) {
    case "ALL":
      return whole;
    case "PRODUCT":
      return plural(locale, products, t.products);
    case "COLLECTION":
      return plural(locale, collections, t.collections);
  }
}

/**
 * "a, b or c". Joined from the messages rather than `Intl.ListFormat`, for the
 * same reason dates are spelled out by hand below: the summary renders on the
 * server and again in the browser, and the two must agree.
 */
function joinOr(items: string[], t: DiscountFormat["t"]): string {
  if (items.length <= 1) return items.join("");
  return format(t.listOr, {
    items: items.slice(0, -1).join(t.listSeparator),
    last: items[items.length - 1],
  });
}

/**
 * The discount's rules in plain sentences, one per line, in the order a seller
 * reads them: what it gives, what it needs, who gets it, how often, and when.
 */
export function describeDiscount(
  discount: DiscountSummary,
  currency: string,
  f: DiscountFormat,
): string[] {
  const { locale, intl, t } = f;
  const lines: string[] = [];

  if (discount.type === "BUY_X_GET_Y") {
    lines.push(
      format(t.buyFrom, {
        items: plural(locale, discount.buyQuantity ?? 1, t.items),
        scope: scopePhrase(
          discount.buysFrom ?? "ALL",
          discount.buyProductCount,
          discount.buyCollectionCount,
          t.anyProduct,
          f,
        ),
      }),
      format(t.getFrom, {
        items: plural(locale, discount.getQuantity ?? 1, t.items),
        reward: reward(discount.value, f),
        scope: scopePhrase(
          discount.appliesTo,
          discount.productCount,
          discount.collectionCount,
          t.anyProduct,
          f,
        ),
      }),
    );
    if (discount.maxUsesPerOrder !== null) {
      lines.push(plural(locale, discount.maxUsesPerOrder, t.maxPerOrder));
    }
  } else if (discount.type === "FREE_SHIPPING") {
    lines.push(t.freeShippingOrder);
  } else {
    lines.push(
      format(t.valueOn, {
        value: formatDiscountValue(discount, currency, f),
        scope: scopePhrase(
          discount.appliesTo,
          discount.productCount,
          discount.collectionCount,
          t.entireOrder,
          f,
        ),
      }),
    );
    if (discount.type === "FIXED_AMOUNT" && discount.appliesTo !== "ALL") {
      lines.push(t.oncePerOrder);
    }
  }

  if (discount.type !== "BUY_X_GET_Y") {
    if (discount.minSubtotalCents !== null) {
      lines.push(
        format(t.minSubtotal, { amount: formatMoney(discount.minSubtotalCents, currency, intl) }),
      );
    } else if (discount.minQuantity !== null) {
      lines.push(plural(locale, discount.minQuantity, t.minQuantity));
    } else {
      lines.push(t.noMinimum);
    }
  }

  if (discount.eligibility === "SEGMENTS" && discount.segments.length > 0) {
    lines.push(
      format(t.forSegments, {
        segments: joinOr(
          discount.segments.map((segment) => f.segments[segment].phrase),
          t,
        ),
      }),
    );
  } else if (discount.eligibility === "CUSTOMERS") {
    lines.push(plural(locale, discount.customerCount, t.forCustomers));
  } else {
    lines.push(t.forAll);
  }

  const limits: string[] = [];
  if (discount.usageLimit !== null) {
    limits.push(plural(locale, discount.usageLimit, t.usageLimit));
  }
  if (discount.perCustomerLimit !== null) {
    limits.push(
      discount.perCustomerLimit === 1
        ? t.oncePerCustomer
        : plural(locale, discount.perCustomerLimit, t.perCustomer),
    );
  }
  lines.push(...(limits.length > 0 ? limits : [t.noLimits]));

  lines.push(discount.combinable ? t.combines : t.notCombinable);

  const window = describeWindow(discount.startsAt, discount.endsAt, f);
  if (window) lines.push(window);

  return lines;
}

/**
 * "1 Jun 2026, 09:00" in UTC, spelled out by hand from the messages' month
 * names and pattern rather than through `Intl`. The form's summary renders on
 * the server and again in the browser, and ICU builds disagree on month
 * abbreviations ("Sep" or "Sept") — a hydration mismatch waiting for the first
 * seller on the other engine.
 */
export function formatUtcDateTime(date: Date, { t }: Pick<DiscountFormat, "t">): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return format(t.dateTime, {
    day: date.getUTCDate(),
    month: t.months[date.getUTCMonth()] ?? String(date.getUTCMonth() + 1),
    year: date.getUTCFullYear(),
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  });
}

/** "From 1 Jun 2026, 09:00 UTC", "… until …", or null when open-ended. */
export function describeWindow(
  startsAt: Date | null,
  endsAt: Date | null,
  f: Pick<DiscountFormat, "t">,
): string | null {
  const { t } = f;
  if (startsAt && endsAt) {
    return format(t.window, {
      start: formatUtcDateTime(startsAt, f),
      end: formatUtcDateTime(endsAt, f),
    });
  }
  if (startsAt) return format(t.from, { start: formatUtcDateTime(startsAt, f) });
  if (endsAt) return format(t.until, { end: formatUtcDateTime(endsAt, f) });
  return null;
}
