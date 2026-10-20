import { formatMoney } from "@/lib/money";
import { formatWeight } from "@/lib/weight";

/**
 * How the admin describes a rate, in English. The storefront words the same
 * facts through its message files instead, in the buyer's language.
 */

type Estimate = { minDeliveryDays: number | null; maxDeliveryDays: number | null };

/** "2–4 business days", "1 business day", or null for no estimate. */
export function formatEstimate({ minDeliveryDays: min, maxDeliveryDays: max }: Estimate): string | null {
  if (min === null || max === null) return null;
  if (max === 0) return "Same business day";
  if (min === max) return `${min} business ${min === 1 ? "day" : "days"}`;
  return `${min}–${max} business days`;
}

type Conditions = {
  minSubtotalCents: number | null;
  maxSubtotalCents: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
};

function range(min: number | null, max: number | null, show: (value: number) => string) {
  if (min !== null && max !== null) return `${show(min)}–${show(max)}`;
  if (min !== null) return `${show(min)} and up`;
  if (max !== null) return `up to ${show(max)}`;
  return null;
}

/** "Orders €50.00 and up", "Up to 2 kg", or null when the rate always applies. */
export function describeRateCondition(rate: Conditions, currency: string): string | null {
  const subtotal = range(rate.minSubtotalCents, rate.maxSubtotalCents, (cents) =>
    formatMoney(cents, currency),
  );
  if (subtotal) return `Orders ${subtotal}`;

  const weight = range(rate.minWeightGrams, rate.maxWeightGrams, formatWeight);
  if (weight) return weight.charAt(0).toUpperCase() + weight.slice(1);

  return null;
}

/** "Free" or the price. */
export function formatRatePrice(priceCents: number, currency: string): string {
  return priceCents === 0 ? "Free" : formatMoney(priceCents, currency);
}
