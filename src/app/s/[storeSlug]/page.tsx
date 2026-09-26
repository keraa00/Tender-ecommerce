import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CollectionCard } from "@/components/storefront/collection-card";
import { EmptyCatalog, ProductGrid } from "@/components/storefront/product-grid";
import {
  collectionCover,
  listStorefrontCollections,
} from "@/lib/collections/queries";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { format, plural } from "@/lib/i18n/messages";
import { listStorefrontProducts } from "@/lib/products/queries";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug } from "@/lib/stores/queries";

const NEW_ARRIVALS = 8;

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) return { title: "Store not found" };

  return {
    title: store.name,
    description: store.description ?? undefined,
  };
}

export default async function StorefrontPage(
  props: PageProps<"/s/[storeSlug]">,
) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  // The tenant key comes from the resolved slug, not from anything the client
  // could set.
  const [{ locale, t }, products, collections] = await Promise.all([
    getStorefrontI18n(),
    // One extra tells us whether "View all" leads anywhere new.
    listStorefrontProducts(store.id, { limit: NEW_ARRIVALS + 1 }),
    listStorefrontCollections(store.id),
  ]);

  const paths = storefrontPaths(store.slug);
  const hasMore = products.length > NEW_ARRIVALS;

  return (
    <>
      <section className="relative isolate overflow-hidden">
        {store.bannerUrl ? (
          <>
            <Image
              src={store.bannerUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="-z-10 object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/35 to-black/5" />
          </>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-15"
            style={{
              background:
                "radial-gradient(120% 90% at 0% 0%, var(--store-accent), transparent 60%)",
            }}
          />
        )}

        <div
          className={
            store.bannerUrl
              ? "mx-auto w-full max-w-6xl px-4 py-20 text-white sm:px-6 sm:py-28"
              : "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20"
          }
        >
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {store.name}
          </h1>
          {store.description ? (
            <p
              className={
                store.bannerUrl
                  ? "mt-4 max-w-xl text-lg text-white/85 text-pretty"
                  : "mt-4 max-w-xl text-lg text-muted text-pretty"
              }
            >
              {store.description}
            </p>
          ) : null}
          <Link
            href={paths.catalog}
            className="mt-8 inline-flex h-12 items-center rounded-lg px-6 text-base font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--store-accent)" }}
          >
            {t.home.shopAll}
          </Link>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-12 sm:px-6">
        {collections.length > 0 ? (
          <section aria-labelledby="collections-heading">
            <h2
              id="collections-heading"
              className="text-xl font-semibold tracking-tight"
            >
              {t.home.collections}
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection) => (
                <CollectionCard
                  key={collection.id}
                  href={paths.collection(collection.slug)}
                  title={collection.title}
                  countLabel={plural(
                    locale,
                    collection._count.products,
                    t.catalog.productCount,
                  )}
                  cover={collectionCover(collection)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="new-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="new-heading" className="text-xl font-semibold tracking-tight">
              {t.home.newArrivals}
            </h2>
            {hasMore ? (
              <Link
                href={paths.catalog}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                {t.home.viewAll} →
              </Link>
            ) : null}
          </div>

          <div className="mt-5">
            {products.length === 0 ? (
              <EmptyCatalog
                title={t.catalog.empty}
                hint={format(t.catalog.emptyHint, { store: store.name })}
              />
            ) : (
              <ProductGrid
                products={products.slice(0, NEW_ARRIVALS)}
                storeSlug={store.slug}
                locale={locale}
                t={t.product}
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
