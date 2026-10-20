import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCart } from "@/components/storefront/add-to-cart";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductGrid } from "@/components/storefront/product-grid";
import { addToCartAction, buyNowAction } from "@/lib/cart/actions";
import { MAX_LINE_QUANTITY } from "@/lib/cart/rules";
import { INTL_LOCALES } from "@/lib/i18n/locales";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import {
  getStorefrontProduct,
  listRelatedProducts,
} from "@/lib/products/queries";
import { storefrontPaths } from "@/lib/storefront/links";
import { canAcceptOrders } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";

async function load(storeSlug: string, productSlug: string) {
  const store = await getStoreBySlug(storeSlug);
  if (!store) return null;
  // (storeId, slug, ACTIVE): drafts and other stores' products both 404.
  const product = await getStorefrontProduct(store.id, productSlug);
  return product ? { store, product } : null;
}

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/p/[productSlug]">,
): Promise<Metadata> {
  const { storeSlug, productSlug } = await props.params;
  const found = await load(storeSlug, productSlug);
  if (!found) return {};

  const { store, product } = found;
  const image = product.images[0];

  return {
    title: `${product.title} · ${store.name}`,
    description: product.description?.slice(0, 160) ?? undefined,
    openGraph: image ? { images: [{ url: image.url }] } : undefined,
  };
}

export default async function ProductPage(
  props: PageProps<"/s/[storeSlug]/p/[productSlug]">,
) {
  const { storeSlug, productSlug } = await props.params;
  const found = await load(storeSlug, productSlug);
  if (!found) notFound();

  const { store, product } = found;
  const collections = product.collections.map((entry) => entry.collection);

  const [{ locale, t }, related] = await Promise.all([
    getStorefrontI18n(),
    listRelatedProducts(
      store.id,
      product.id,
      collections.map((collection) => collection.id),
    ),
  ]);

  const paths = storefrontPaths(store.slug);
  const money = (cents: number) =>
    formatMoney(cents, store.currency, INTL_LOCALES[locale]);

  const onlyDefault =
    product.variants.length === 1 &&
    product.variants[0]?.title.toLowerCase() === "default";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={paths.home} className="hover:text-foreground">
              {t.nav.home}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={paths.catalog} className="hover:text-foreground">
              {t.nav.catalog}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="truncate text-foreground">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <ProductGallery
          title={product.title}
          noPhotoLabel={t.product.noPhoto}
          images={product.images.map((image) => ({
            url: image.url,
            alt: image.altText ?? product.title,
          }))}
        />

        <div className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {product.title}
          </h1>

          <div className="mt-5">
            <AddToCart
              action={addToCartAction.bind(null, store.slug)}
              buyNow={canAcceptOrders(store) ? buyNowAction.bind(null, store.slug) : null}
              showOptions={!onlyDefault}
              maxQuantity={MAX_LINE_QUANTITY}
              t={t.product}
              stepperLabels={{ increase: t.cart.increase, decrease: t.cart.decrease }}
              errors={{
                "sold-out": t.product.soldOut,
                unavailable: t.product.notFound,
                failed: t.cart.error,
              }}
              variants={product.variants.map((variant) => ({
                id: variant.id,
                title: variant.title,
                price: money(variant.priceCents),
                compareAt:
                  variant.compareAtPriceCents !== null &&
                  variant.compareAtPriceCents > variant.priceCents
                    ? money(variant.compareAtPriceCents)
                    : null,
                inventoryQty: variant.inventoryQty,
              }))}
            />
          </div>

          {product.description ? (
            <section className="mt-10 border-t border-border pt-6">
              <h2 className="text-sm font-medium">{t.product.description}</h2>
              <p className="mt-2 whitespace-pre-line text-muted text-pretty">
                {product.description}
              </p>
            </section>
          ) : null}

          {collections.length > 0 ? (
            <section className="mt-6 border-t border-border pt-6">
              <h2 className="text-sm font-medium">{t.product.inCollections}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {collections.map((collection) => (
                  <li key={collection.id}>
                    <Link
                      href={paths.collection(collection.slug)}
                      className="block rounded-full border border-border-strong px-3 py-1 text-sm transition-colors hover:border-foreground"
                    >
                      {collection.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-20">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            {t.product.related}
          </h2>
          <div className="mt-5">
            <ProductGrid
              products={related}
              storeSlug={store.slug}
              currency={store.currency}
              locale={locale}
              t={t.product}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
