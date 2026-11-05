import "server-only";

import { cache } from "react";
import { rootDb } from "@/lib/db/root";
import { readPublishedTheme } from "@/lib/theme/queries";
import { storeCoverImage } from "@/lib/theme/sections/hero";

/**
 * Store lookups. Resolving a store is the one query that legitimately has no
 * `storeId` filter — it is what *produces* the tenant key that every other
 * query is scoped by.
 */

/** Public storefront lookup by URL slug. Deduplicated per request. */
export const getStoreBySlug = cache(async (slug: string) => {
  return rootDb.store.findUnique({ where: { slug } });
});

/** Stores the signed-in user may administer, via membership — not ownership. */
export async function listStoresForUser(userId: string) {
  return rootDb.store.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { products: true, orders: true } },
    },
  });
}

/** Backs the live availability check on the create-store form. */
export async function isStoreSlugTaken(slug: string): Promise<boolean> {
  const existing = await rootDb.store.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Storefronts to feature on the platform landing page, each with the picture
 * from the top of its home page as `coverUrl`.
 */
export async function listPublicStores(limit = 12) {
  const stores = await rootDb.store.findMany({
    where: { status: { not: "SUSPENDED" } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      _count: { select: { products: true } },
      theme: { select: { published: true } },
    },
  });

  return stores.map(({ theme, ...store }) => ({
    ...store,
    coverUrl: storeCoverImage(readPublishedTheme(theme?.published), store),
  }));
}

/**
 * The address buyers are offered — on the contact page and at checkout: the
 * store's own contact email, falling back to the owner's account email.
 * `ownerOnly` skips the store's, for the settings page to name the fallback.
 */
export async function getStoreContactEmail(
  storeId: string,
  { ownerOnly = false }: { ownerOnly?: boolean } = {},
) {
  const store = await rootDb.store.findUnique({
    where: { id: storeId },
    select: { contactEmail: true, owner: { select: { email: true } } },
  });
  if (!store) return null;
  return (ownerOnly ? null : store.contactEmail) ?? store.owner.email;
}
