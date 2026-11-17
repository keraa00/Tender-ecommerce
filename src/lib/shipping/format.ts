import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney } from "@/lib/money";
import { formatWeight } from "@/lib/weight";

/**
 * How the admin describes a rate, in the seller's language. The storefront
 * words the same facts through its own message files, in the buyer's.
 */

export type ShippingFormat = {
  locale: Locale;
  /** The BCP 47 tag for money and weights. */
  intl: string;
  t: AdminMessages["shippingFormat"];
};

type Estimate = { minDeliveryDays: number | null; maxDeliveryDays: number | null };

/** "2–4 business days", "1 business day", or null for no estimate. */
export function formatEstimate(
  { minDeliveryDays: min, maxDeliveryDays: max }: Estimate,
  { locale, intl, t }: ShippingFormat,
): string | null {
  if (min === null || max === null) return null;
  if (max === 0) return t.sameDay;
  if (min === max) return plural(locale, min, t.days);

  const number = new Intl.NumberFormat(intl);
  return format(t.dayRange, { min: number.format(min), max: number.format(max) });
}

type Conditions = {
  minSubtotalCents: number | null;
  maxSubtotalCents: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
};

type RangeCopy = { between: string; andUp: string; upTo: string };

function range(
  min: number | null,
  max: number | null,
  show: (value: number) => string,
  copy: RangeCopy,
): string | null {
  if (min !== null && max !== null) return format(copy.between, { min: show(min), max: show(max) });
  if (min !== null) return format(copy.andUp, { min: show(min) });
  if (max !== null) return format(copy.upTo, { max: show(max) });
  return null;
}

/** "Orders €50.00 and up", "Up to 2 kg", or null when the rate always applies. */
export function describeRateCondition(
  rate: Conditions,
  currency: string,
  { intl, t }: ShippingFormat,
): string | null {
  return (
    range(
      rate.minSubtotalCents,
      rate.maxSubtotalCents,
      (cents) => formatMoney(cents, currency, intl),
      t.subtotal,
    ) ??
    range(rate.minWeightGrams, rate.maxWeightGrams, (grams) => formatWeight(grams, intl), t.weight)
  );
}

/** "Free" or the price. */
export function formatRatePrice(
  priceCents: number,
  currency: string,
  { intl, t }: ShippingFormat,
): string {
  return priceCents === 0 ? t.free : formatMoney(priceCents, currency, intl);
}
