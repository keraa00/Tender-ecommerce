/**
 * Cart arithmetic, kept pure so it can be tested without a database or cookies.
 */

/** A single line never goes above this, whatever the stock says. */
export const MAX_LINE_QUANTITY = 99;

/**
 * The quantity a line may actually hold: at least 0, no more than is in stock,
 * and no more than the per-line cap. Garbage input clamps to 0, which the
 * caller treats as "remove".
 */
export function clampLineQuantity(requested: number, inventoryQty: number): number {
  if (!Number.isFinite(requested)) return 0;
  const ceiling = Math.min(Math.max(inventoryQty, 0), MAX_LINE_QUANTITY);
  return Math.min(Math.max(Math.trunc(requested), 0), ceiling);
}

/** Parses a quantity field. Anything that is not a whole number is null. */
export function parseQuantity(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

type SummableLine = { quantity: number; unitPriceCents: number; available: boolean };

/** Only lines that can still be bought count towards the total. */
export function cartTotals(lines: readonly SummableLine[]) {
  let itemCount = 0;
  let subtotalCents = 0;

  for (const line of lines) {
    if (!line.available) continue;
    itemCount += line.quantity;
    subtotalCents += line.quantity * line.unitPriceCents;
  }

  return { itemCount, subtotalCents };
}
