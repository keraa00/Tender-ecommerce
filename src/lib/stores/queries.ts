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
 * Storefronts to feature on the platform landing page and /stores, each with
 * the picture from the top of its home page as `coverUrl`.
 *
 * Only stores a platform admin has featured: anyone can open a store, and a
 * stranger's must not reach the front page by signing up. Suspended stores
 * never show, featured or not.
 */
export async function listPublicStores(limit = 12) {
  const stores = await rootDb.store.findMany({
    where: { featured: true, status: { not: "SUSPENDED" } },
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
 * store's own contact email, or none.
 *
 * Never the owner's account email. That is the address they sign in with,
 * and falling back to it would publish every seller's login on their
 * storefront — and, through the store list, to anyone collecting them.
 */
export async function getStoreContactEmail(storeId: string) {
  const store = await rootDb.store.findUnique({
    where: { id: storeId },
    select: { contactEmail: true },
  });
  return store?.contactEmail ?? null;
}

/**
 * What deleting the store would run into, for the Settings danger zone and
 * `deleteStoreAction`: the orders that block it, the unpaid Stripe checkouts
 * whose PaymentIntents get cancelled on the way, and how many orders carry an
 * issue that may still want a refund in Stripe.
 */
export async function getStoreDeletionReview(storeId: string) {
  const [paidUnfulfilled, pendingCod, needsAttention, openCheckouts] = await Promise.all([
    rootDb.order.count({ where: { storeId, status: "PAID" } }),
    rootDb.order.count({
      where: { storeId, status: "PENDING", paymentMethod: "CASH_ON_DELIVERY" },
    }),
    rootDb.order.count({ where: { storeId, issues: { isEmpty: false } } }),
    rootDb.order.findMany({
      where: {
        storeId,
        status: "PENDING",
        paymentMethod: "STRIPE",
        stripePaymentIntentId: { not: null },
      },
      select: { id: true, stripePaymentIntentId: true, stripeAccountId: true },
    }),
  ]);

  return { paidUnfulfilled, pendingCod, needsAttention, openCheckouts };
}
