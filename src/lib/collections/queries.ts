import "server-only";

import { rootDb } from "@/lib/db/root";
import { ProductStatus } from "@/lib/db/types";

/**
 * Collection reads. Like the product queries, every one takes `storeId` first
 * and filters by it — a collection id or slug alone never identifies a row.
 *
 * Collections have no image of their own; the cover is the first published
 * product's first photo, which keeps the cover in step with what is actually
 * on sale.
 */

const coverInclude = {
  products: {
    where: { product: { status: ProductStatus.ACTIVE } },
    orderBy: { position: "asc" as const },
    take: 1,
    select: {
      product: {
        select: {
          images: {
            orderBy: { position: "asc" as const },
            take: 1,
            select: { url: true, altText: true },
          },
        },
      },
    },
  },
};

type WithCover = {
  products: { product: { images: { url: string; altText: string | null }[] } }[];
};

export function collectionCover(collection: WithCover) {
  return collection.products[0]?.product.images[0] ?? null;
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

/** Collections with something to buy in them. Empty ones stay out of the menu. */
export async function listStorefrontCollections(storeId: string) {
  const collections = await rootDb.collection.findMany({
    where: {
      storeId,
      products: { some: { product: { status: ProductStatus.ACTIVE } } },
    },
    orderBy: { title: "asc" },
    include: {
      ...coverInclude,
      _count: {
        select: {
          products: { where: { product: { status: ProductStatus.ACTIVE } } },
        },
      },
    },
  });

  return collections;
}

export type StorefrontCollection = Awaited<
  ReturnType<typeof listStorefrontCollections>
>[number];

export async function getStorefrontCollection(storeId: string, slug: string) {
  return rootDb.collection.findUnique({
    where: { storeId_slug: { storeId, slug } },
    select: { id: true, title: true, slug: true, description: true },
  });
}

// ---------------------------------------------------------------------------
// Seller admin
// ---------------------------------------------------------------------------

/** Every collection, empty or not, for the admin list. */
export async function listStoreCollections(storeId: string) {
  return rootDb.collection.findMany({
    where: { storeId },
    orderBy: { title: "asc" },
    include: {
      ...coverInclude,
      _count: { select: { products: true } },
    },
  });
}

/** Just enough to render the collection picker on the product form. */
export async function listCollectionOptions(storeId: string) {
  return rootDb.collection.findMany({
    where: { storeId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

/** One collection for editing, with its products in the seller's order. */
export async function getStoreCollection(storeId: string, collectionId: string) {
  return rootDb.collection.findFirst({
    where: { id: collectionId, storeId },
    include: {
      products: {
        orderBy: { position: "asc" },
        select: { productId: true, position: true },
      },
    },
  });
}
