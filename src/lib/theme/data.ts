import "server-only";

import { cache } from "react";

import type { NavItem } from "@/components/storefront/types";
import { getCartPricing } from "@/lib/checkout/pricing";
import { listStorefrontCollections } from "@/lib/collections/queries";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { listStorefrontProducts } from "@/lib/products/queries";
import { storefrontPaths } from "@/lib/storefront/links";
import type { StorefrontContext } from "./define";

/**
 * Builds the context theme sections render with, bound to one store.
 *
 * `store` must be the store resolved from the request's URL slug. Every data
 * function below closes over its id, so a section can read this store's
 * catalogue and nothing else.
 */
export async function getStorefrontContext(
  store: StorefrontContext["store"],
): Promise<StorefrontContext> {
  const { locale, t } = await getStorefrontI18n();
  const paths = storefrontPaths(store.slug);

  const nav: NavItem[] = [
    { href: paths.home, label: t.nav.home, exact: true },
    { href: paths.catalog, label: t.nav.catalog },
    { href: paths.contact, label: t.nav.contact },
  ];

  return {
    store,
    locale,
    t,
    paths,
    nav,
    data: {
      collections: () => collectionsFor(store.id),
      products: ({ limit, collectionId }) => productsFor(store.id, limit, collectionId),
      cartItemCount: async () => (await getCartPricing(store.id)).cart.itemCount,
    },
  };
}

// Per request, so the layout and the page — and two sections asking the same
// question — share one query.
const collectionsFor = cache((storeId: string) => listStorefrontCollections(storeId));

const productsFor = cache((storeId: string, limit: number, collectionId?: string) =>
  listStorefrontProducts(storeId, { limit, collectionId }),
);
