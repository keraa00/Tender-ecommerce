import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogView } from "@/components/storefront/catalog-view";
import {
  getStorefrontCollection,
  listStorefrontCollections,
} from "@/lib/collections/queries";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { listStorefrontProducts } from "@/lib/products/queries";
import { parseCatalogSort } from "@/lib/products/sort";
import { getStoreBySlug } from "@/lib/stores/queries";

async function load(storeSlug: string, collectionSlug: string) {
  const store = await getStoreBySlug(storeSlug);
  if (!store) return null;
  // Looked up by (storeId, slug): another store's collection slug never matches.
  const collection = await getStorefrontCollection(store.id, collectionSlug);
  return collection ? { store, collection } : null;
}

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/collections/[collectionSlug]">,
): Promise<Metadata> {
  const { storeSlug, collectionSlug } = await props.params;
  const found = await load(storeSlug, collectionSlug);
  if (!found) return {};

  return {
    title: `${found.collection.title} · ${found.store.name}`,
    description: found.collection.description ?? undefined,
  };
}

export default async function CollectionPage(
  props: PageProps<"/s/[storeSlug]/collections/[collectionSlug]">,
) {
  const { storeSlug, collectionSlug } = await props.params;
  const { sort: rawSort } = await props.searchParams;

  const found = await load(storeSlug, collectionSlug);
  if (!found) notFound();
  const { store, collection } = found;

  // A collection opens in the seller's own order.
  const sort = parseCatalogSort(rawSort, "featured");

  const [{ locale, t }, products, collections] = await Promise.all([
    getStorefrontI18n(),
    listStorefrontProducts(store.id, { collectionId: collection.id, sort }),
    listStorefrontCollections(store.id),
  ]);

  return (
    <CatalogView
      storeSlug={store.slug}
      title={collection.title}
      description={collection.description}
      collections={collections}
      activeCollectionSlug={collection.slug}
      products={products}
      sort={sort}
      sortOptions={["featured", "newest", "price-asc", "price-desc", "title"]}
      locale={locale}
      t={t}
      emptyTitle={t.collection.empty}
      emptyHint={t.search.noResultsHint}
    />
  );
}
