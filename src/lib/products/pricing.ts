/**
 * Price and stock summaries for a product's variants. Pure and free of
 * `server-only`, so both admin and storefront components — and tests — can use
 * them.
 */

/** Cheapest variant price, and whether prices vary across variants. */
export function priceRange(product: { variants: { priceCents: number }[] }) {
  const prices = product.variants.map((variant) => variant.priceCents);

  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

export function isSoldOut(product: {
  variants: { inventoryQty: number }[];
}): boolean {
  return product.variants.every((variant) => variant.inventoryQty <= 0);
}

/** Total stock across a product's options, for the catalogue list. */
export function totalInventory(product: {
  variants: { inventoryQty: number }[];
}): number {
  return product.variants.reduce((sum, variant) => sum + variant.inventoryQty, 0);
}
