import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogView } from "@/components/storefront/catalog-view";
import { listStorefrontCollections } from "@/lib/collections/queries";
import { format } from "@/lib/i18n/messages";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { listStorefrontProducts } from "@/lib/products/queries";
import { parseCatalogSort } from "@/lib/products/sort";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/catalog">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([
    getStoreBySlug(storeSlug),
    getStorefrontI18n(),
  ]);
  return { title: store ? `${t.catalog.title} · ${store.name}` : t.catalog.title };
}

export default async function CatalogPage(
  props: PageProps<"/s/[storeSlug]/catalog">,
) {
  const { storeSlug } = await props.params;
  const { sort: rawSort } = await props.searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const sort = parseCatalogSort(rawSort);

  const [{ locale, t }, products, collections] = await Promise.all([
    getStorefrontI18n(),
    listStorefrontProducts(store.id, { sort }),
    listStorefrontCollections(store.id),
  ]);

  return (
    <CatalogView
      storeSlug={store.slug}
      title={t.catalog.title}
      collections={collections}
      activeCollectionSlug={null}
      products={products}
      sort={sort}
      sortOptions={["newest", "price-asc", "price-desc", "title"]}
      locale={locale}
      t={t}
      emptyTitle={t.catalog.empty}
      emptyHint={format(t.catalog.emptyHint, { store: store.name })}
    />
  );
}
