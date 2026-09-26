/**
 * Storefront catalogue ordering. Dependency-free: the sort menu is a Client
 * Component and needs the list, and the ordering itself is pure so it can be
 * tested without a database.
 *
 * Price ordering happens in memory rather than in SQL. A product's price is the
 * cheapest of its variants, which Prisma cannot order a `findMany` by, and a
 * storefront page is small enough that sorting the page is cheaper than the raw
 * query it would take not to.
 */

export const CATALOG_SORTS = ["featured", "newest", "price-asc", "price-desc", "title"] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];

export function parseCatalogSort(
  value: unknown,
  fallback: CatalogSort = "newest",
): CatalogSort {
  return typeof value === "string" &&
    (CATALOG_SORTS as readonly string[]).includes(value)
    ? (value as CatalogSort)
    : fallback;
}

type Sortable = {
  title: string;
  createdAt: Date;
  variants: { priceCents: number }[];
  /** Position within the collection being viewed, when there is one. */
  position?: number;
};

function lowestPrice(product: Sortable): number {
  return product.variants.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...product.variants.map((variant) => variant.priceCents));
}

const newestFirst = (a: Sortable, b: Sortable) =>
  b.createdAt.getTime() - a.createdAt.getTime();

/** Returns a new array; the input is left alone. */
export function sortProducts<T extends Sortable>(
  products: readonly T[],
  sort: CatalogSort,
): T[] {
  const copy = [...products];

  switch (sort) {
    case "featured":
      // The seller's own order within a collection; newest breaks ties so the
      // result is stable when positions were never set.
      return copy.sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0) || newestFirst(a, b),
      );
    case "price-asc":
      return copy.sort((a, b) => lowestPrice(a) - lowestPrice(b) || newestFirst(a, b));
    case "price-desc":
      // Products without a price have nothing to compare, so they sink either way.
      return copy.sort((a, b) => {
        const pa = lowestPrice(a);
        const pb = lowestPrice(b);
        if (pa === pb) return newestFirst(a, b);
        if (!Number.isFinite(pa)) return 1;
        if (!Number.isFinite(pb)) return -1;
        return pb - pa;
      });
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "newest":
      return copy.sort(newestFirst);
  }
}
