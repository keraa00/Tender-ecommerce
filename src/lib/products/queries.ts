import "server-only";

import { rootDb } from "@/lib/db/root";
import { Prisma, ProductStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { escapeLikePattern, rankByTitle, searchTerms } from "./search";
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
 * Published products containing every word of the query, case-insensitively,
 * in the title or the description — best title matches first (see
 * `rankByTitle`). A `contains` scan is fine at one store's catalogue size;
 * full-text search is the upgrade when it is not.
 *
 * Ranking reads only ids and titles; card data is loaded for the `limit`
 * products that are actually shown. `total` counts every match.
 */
async function rankedStorefrontSearch(
  storeId: string,
  query: string,
  limit: number,
) {
  const terms = searchTerms(query);
  if (terms.length === 0) return { products: [], total: 0 };

  const where = {
    storeId,
    status: ProductStatus.ACTIVE,
    AND: terms.map((term): Prisma.ProductWhereInput => ({
      OR: [
        { title: { contains: escapeLikePattern(term), mode: "insensitive" } },
        { description: { contains: escapeLikePattern(term), mode: "insensitive" } },
      ],
    })),
  } satisfies Prisma.ProductWhereInput;

  const candidates = await rootDb.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: STOREFRONT_PAGE_SIZE,
    select: { id: true, title: true },
  });
  const ids = rankByTitle(candidates, terms)
    .slice(0, limit)
    .map((product) => product.id);

  const [rows, total] = await Promise.all([
    ids.length === 0
      ? []
      : rootDb.product.findMany({
          where: { storeId, status: ProductStatus.ACTIVE, id: { in: ids } },
          include: storefrontCardInclude,
        }),
    candidates.length < STOREFRONT_PAGE_SIZE
      ? candidates.length
      : rootDb.product.count({ where }),
  ]);

  const byId = new Map(rows.map((product) => [product.id, product]));
  const products = ids.flatMap((id) => byId.get(id) ?? []);
  return { products, total };
}

/** Results for the storefront's search page. */
export async function searchStorefrontProducts(
  storeId: string,
  query: string,
  limit = 48,
) {
  return (await rankedStorefrontSearch(storeId, query, limit)).products;
}

/** The handful of results shown under the header's search field as it is typed in. */
export async function suggestStorefrontProducts(
  storeId: string,
  query: string,
  limit = 6,
) {
  return rankedStorefrontSearch(storeId, query, limit);
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
  // A malformed id (`/products/abc`) is a missing product, not a database
  // error: Postgres refuses to compare a uuid column with it.
  if (!isUuid(productId)) return null;
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
