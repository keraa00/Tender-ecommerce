/**
 * A collection's cover: its first published product's first photo. Collections
 * have no image of their own, which keeps the cover in step with what is
 * actually on sale.
 *
 * Kept apart from `./queries`, which is `server-only`, so the storefront's
 * theme sections can draw a cover without importing the database.
 */

type WithCover = {
  products: { product: { images: { url: string; altText: string | null }[] } }[];
};

export function collectionCover(collection: WithCover) {
  return collection.products[0]?.product.images[0] ?? null;
}
