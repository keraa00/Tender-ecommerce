import type { Metadata } from "next";
import Form from "next/form";
import { notFound } from "next/navigation";

import { EmptyCatalog, ProductGrid } from "@/components/storefront/product-grid";
import { SearchIcon } from "@/components/storefront/icons";
import { format, plural } from "@/lib/i18n/messages";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { searchStorefrontProducts } from "@/lib/products/queries";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/search">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([
    getStoreBySlug(storeSlug),
    getStorefrontI18n(),
  ]);
  return {
    title: store ? `${t.search.title} · ${store.name}` : t.search.title,
    // Result pages for arbitrary queries are not worth indexing.
    robots: { index: false },
  };
}

export default async function SearchPage(
  props: PageProps<"/s/[storeSlug]/search">,
) {
  const { storeSlug } = await props.params;
  const { q } = await props.searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const query = (typeof q === "string" ? q : "").trim().slice(0, 100);

  const [{ locale, t }, products] = await Promise.all([
    getStorefrontI18n(),
    searchStorefrontProducts(store.id, query),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.search.title}</h1>

      <Form
        action={storefrontPaths(store.slug).search}
        role="search"
        className="mt-6 flex max-w-xl items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 focus-within:border-foreground"
      >
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          maxLength={100}
          placeholder={t.search.placeholder}
          aria-label={t.search.title}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          className="h-9 shrink-0 cursor-pointer rounded-lg px-3.5 text-sm font-medium text-white bg-store-accent transition-colors hover:bg-store-accent-hover"
        >
          {t.search.submit}
        </button>
      </Form>

      <div className="mt-8">
        {query === "" ? (
          <p className="text-muted">{t.search.prompt}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {format(t.search.resultsFor, { query })} ·{" "}
              {plural(locale, products.length, t.catalog.productCount)}
            </p>
            <div className="mt-4">
              {products.length === 0 ? (
                <EmptyCatalog title={t.search.noResults} hint={t.search.noResultsHint} />
              ) : (
                <ProductGrid
                  products={products}
                  storeSlug={store.slug}
                  locale={locale}
                  t={t.product}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
