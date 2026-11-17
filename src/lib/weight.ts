/**
 * Weight is integer grams everywhere — in the database, in shipping rules and
 * on the wire. Sellers type kilograms; conversion happens only here, at the
 * edge, the way `money.ts` handles cents.
 */

/** A kilo and a half more than any parcel a seller should be posting. */
export const MAX_WEIGHT_GRAMS = 1_000_000;

/**
 * Parses a kilogram amount like "0.35" or "2,5 kg" into grams. Reads the digits
 * out of the string rather than multiplying a float — 0.035 × 1000 is
 * 35.00000000000001 — and rounds the fourth decimal half up. Null when it is
 * not a number of kilograms.
 */
export function parseWeightToGrams(input: string): number | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/\s*kg$/, "")
    .replace(",", ".");
  if (cleaned === "" || cleaned === "." || !/^\d*\.?\d*$/.test(cleaned)) return null;

  const [whole = "", fraction = ""] = cleaned.split(".");
  const padded = `${fraction}0000`;
  const grams = Number(whole || "0") * 1000 + Number(padded.slice(0, 3));
  return grams + (Number(padded[3]) >= 5 ? 1 : 0);
}

/** Grams as kilograms for an input: "0.35", "12", "1.005". No trailing zeros. */
export function gramsToInputValue(grams: number): string {
  return String(grams / 1000);
}

/** For display: "350 g", "1.2 kg" — in the seller's language's number style. */
export function formatWeight(grams: number, locale = "en-US"): string {
  const kilograms = grams >= 1000;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: kilograms ? "kilogram" : "gram",
    unitDisplay: "short",
    maximumFractionDigits: kilograms ? 2 : 0,
  }).format(kilograms ? grams / 1000 : grams);
}
