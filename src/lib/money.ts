/**
 * Money is integer cents everywhere — in the database, in business logic, and
 * on the wire. Formatting to a decimal string happens only at the edge, here.
 */

const DEFAULT_CURRENCY = "USD";
const DEFAULT_LOCALE = "en-US";

export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  /** A BCP 47 tag. The storefront passes the buyer's language here. */
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Platform commission, rounded half-up to the nearest cent.
 *
 * Applied to the *post-discount* total: the platform takes a cut of what the
 * buyer actually paid, not of a list price nobody was charged. A seller running
 * a 20% promotion is not billed commission on the 20% they gave away.
 *
 * The clamp matters — Stripe rejects an application fee that exceeds the charge,
 * and a mis-set commissionBps would otherwise fail at the API boundary instead
 * of here.
 */
export function calculatePlatformFee(
  totalCents: number,
  commissionBps: number,
): number {
  if (totalCents <= 0) return 0;

  const fee = Math.round((totalCents * commissionBps) / 10_000);
  return Math.min(Math.max(fee, 0), totalCents);
}

/**
 * Parses a user-entered price like "24.99" or "$24.99" into cents.
 *
 * Deliberately does not go via `parseFloat(x) * 100`: 1.005 is not exactly
 * representable in binary floating point, so that route rounds it *down* to
 * 100 cents. The digits are read out of the string instead, which keeps the
 * "never floats" rule true at the one place money enters the system.
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.includes("-")) return null;

  const cleaned = trimmed.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === "." || !/^\d*\.?\d*$/.test(cleaned)) {
    return null;
  }

  const [whole = "", fraction = ""] = cleaned.split(".");
  const padded = `${fraction}000`;

  const cents = Number(whole || "0") * 100 + Number(padded.slice(0, 2));
  const roundUp = Number(padded[2]) >= 5;

  return cents + (roundUp ? 1 : 0);
}

/**
 * Cents as a plain decimal string for a price input — no currency symbol and no
 * grouping separators, both of which a `type="text"` price field would have to
 * strip back out before `parseMoneyToCents` could read it.
 */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}
