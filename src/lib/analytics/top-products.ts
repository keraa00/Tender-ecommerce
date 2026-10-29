/**
 * The best-sellers fold, kept apart from the query so it can be tested
 * without a database.
 */

export type TopProduct = {
  title: string;
  units: number;
  /** What buyers paid for it: units at their price, less its share of item discounts. */
  revenueCents: number;
};

/** One `(title, unit price)` group of order lines, as the query sums them. */
export type TopProductRow = {
  titleSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
};

/**
 * Folds the groups a title has sold under — one per price it has sold at —
 * into one row per title, best revenue first. Net of each line's discount,
 * which the engine split exactly across the lines, so the column adds up to
 * what buyers paid for items rather than what the items were listed at.
 */
export function foldTopProducts(rows: readonly TopProductRow[], limit: number): TopProduct[] {
  const byTitle = new Map<string, TopProduct>();

  for (const row of rows) {
    const existing = byTitle.get(row.titleSnapshot) ?? {
      title: row.titleSnapshot,
      units: 0,
      revenueCents: 0,
    };

    existing.units += row.quantity;
    existing.revenueCents += row.quantity * row.unitPriceCents - row.discountCents;
    byTitle.set(row.titleSnapshot, existing);
  }

  return [...byTitle.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, limit);
}
