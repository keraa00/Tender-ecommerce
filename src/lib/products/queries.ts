import "server-only";

import { rootDb } from "@/lib/db/root";
import { ProductStatus } from "@/lib/db/types";

/**
 * Every query here takes `storeId` as its first argument and applies it as a
 * filter. Callers get it from `getStoreContext()` or from the resolved URL
 * slug — never from a request body.
 *
 * Pagination, collection filters, sorting and full-text search build on top of
 * these.
 */

export async function listStorefrontProducts(storeId: string, limit = 24) {
  return rootDb.product.findMany({
    where: { storeId, status: ProductStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: {
        orderBy: { position: "asc" },
        select: { id: true, priceCents: true, inventoryQty: true },
      },
    },
  });
}

export type StorefrontProduct = Awaited<
  ReturnType<typeof listStorefrontProducts>
>[number];

/** Cheapest variant price, and whether prices vary across variants. */
export function priceRange(product: StorefrontProduct) {
  const prices = product.variants.map((variant) => variant.priceCents);

  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

export function isSoldOut(product: StorefrontProduct): boolean {
  return product.variants.every((variant) => variant.inventoryQty <= 0);
}

/**
 * Seller-admin catalogue: every status, newest first. The storefront list above
 * is deliberately separate — it filters to ACTIVE, and merging the two behind a
 * flag is how a draft ends up visible to buyers.
 */
export async function listStoreProducts(storeId: string) {
  return rootDb.product.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: {
        orderBy: { position: "asc" },
        select: { id: true, priceCents: true, inventoryQty: true },
      },
    },
  });
}

export type StoreProduct = Awaited<ReturnType<typeof listStoreProducts>>[number];

/**
 * One product for editing. `storeId` is part of the filter rather than checked
 * afterwards, so a guessed product id from another tenant returns null instead
 * of leaking a row.
 */
export async function getStoreProduct(storeId: string, productId: string) {
  return rootDb.product.findFirst({
    where: { id: productId, storeId },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
    },
  });
}

export type EditableProduct = NonNullable<
  Awaited<ReturnType<typeof getStoreProduct>>
>;

/** Total stock across a product's options, for the catalogue list. */
export function totalInventory(product: {
  variants: { inventoryQty: number }[];
}): number {
  return product.variants.reduce((sum, variant) => sum + variant.inventoryQty, 0);
}
