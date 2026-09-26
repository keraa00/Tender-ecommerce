import "server-only";

import { cache } from "react";
import { rootDb } from "@/lib/db/root";

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

/** Storefronts to feature on the platform landing page. */
export async function listPublicStores(limit = 12) {
  return rootDb.store.findMany({
    where: { status: { not: "SUSPENDED" } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      _count: { select: { products: true } },
    },
  });
}

/**
 * The address the storefront's contact page offers buyers. Stores have no
 * separate contact field yet, so this is the owner's account email.
 */
export async function getStoreContactEmail(storeId: string) {
  const store = await rootDb.store.findUnique({
    where: { id: storeId },
    select: { owner: { select: { email: true } } },
  });
  return store?.owner.email ?? null;
}
