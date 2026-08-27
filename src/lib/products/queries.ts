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
