import "server-only";

import { rootDb } from "@/lib/db/root";
import { Prisma, ProductStatus } from "@/lib/db/types";
import { sortProducts, type CatalogSort } from "./sort";

export { isSoldOut, priceRange, totalInventory } from "./pricing";

/**
 * Every query here takes `storeId` as its first argument and applies it as a
 * filter. Callers get it from `getStoreContext()` or from the resolved URL
 * slug — never from a request body.
 *
 * Pagination and full-text search build on top of these.
 */

/** Enough for any storefront page; the catalogue is not paginated yet. */
const STOREFRONT_PAGE_SIZE = 120;

const storefrontCardInclude = {
  images: { orderBy: { position: "asc" }, take: 1 },
  variants: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      priceCents: true,
      compareAtPriceCents: true,
      inventoryQty: true,
    },
  },
} satisfies Prisma.ProductInclude;

/**
 * Published products for a storefront grid. `collectionId` narrows it to one
 * collection, whose own ordering is then available as the "featured" sort.
 */
export async function listStorefrontProducts(
  storeId: string,
  {
    collectionId,
    sort = "newest",
    limit = STOREFRONT_PAGE_SIZE,
  }: { collectionId?: string; sort?: CatalogSort; limit?: number } = {},
) {
  const products = await rootDb.product.findMany({
    where: {
      storeId,
      status: ProductStatus.ACTIVE,
      ...(collectionId ? { collections: { some: { collectionId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Sorting by price happens after the fetch, so the cut has to as well.
    take: sort === "newest" ? limit : STOREFRONT_PAGE_SIZE,
    include: {
      ...storefrontCardInclude,
      collections: collectionId
        ? { where: { collectionId }, select: { position: true } }
        : false,
    },
  });

  const sortable = products.map(({ collections, ...product }) => ({
    ...product,
    position: collections?.[0]?.position,
  }));

  return sortProducts(sortable, sort).slice(0, limit);
}

export type StorefrontProduct = Awaited<
  ReturnType<typeof listStorefrontProducts>
>[number];

/**
 * Case-insensitive match on title or description. A `contains` scan is fine at
 * one store's catalogue size; full-text search is the upgrade when it is not.
 */
export async function searchStorefrontProducts(
  storeId: string,
  query: string,
  limit = 48,
) {
  const term = query.trim().slice(0, 100);
  if (term === "") return [];

  return rootDb.product.findMany({
    where: {
      storeId,
      status: ProductStatus.ACTIVE,
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: storefrontCardInclude,
  });
}

/** One published product by its storefront address. Drafts 404. */
export async function getStorefrontProduct(storeId: string, slug: string) {
  return rootDb.product.findFirst({
    where: { storeId, slug, status: ProductStatus.ACTIVE },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
      collections: {
        orderBy: { collection: { title: "asc" } },
        select: {
          collection: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  });
}

/** Other published products sharing a collection with this one. */
export async function listRelatedProducts(
  storeId: string,
  productId: string,
  collectionIds: string[],
  limit = 4,
) {
  if (collectionIds.length === 0) return [];

  return rootDb.product.findMany({
    where: {
      storeId,
      status: ProductStatus.ACTIVE,
      id: { not: productId },
      collections: { some: { collectionId: { in: collectionIds } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: storefrontCardInclude,
  });
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
      collections: { select: { collectionId: true } },
    },
  });
}

export type EditableProduct = NonNullable<
  Awaited<ReturnType<typeof getStoreProduct>>
>;
