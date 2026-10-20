import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/locales";
import { plural, type Messages } from "@/lib/i18n/messages";
import type { StorefrontProduct } from "@/lib/products/queries";
import type { CatalogSort } from "@/lib/products/sort";
import { storefrontPaths } from "@/lib/storefront/links";
import { EmptyCatalog, ProductGrid } from "./product-grid";
import { SortMenu } from "./sort-menu";

/**
 * The catalogue and every collection page share this: a heading, a row of
 * collection chips to hop between them, a sort menu and the grid.
 */
export function CatalogView({
  storeSlug,
  currency,
  title,
  description,
  collections,
  activeCollectionSlug,
  products,
  sort,
  sortOptions,
  locale,
  t,
  emptyTitle,
  emptyHint,
}: {
  storeSlug: string;
  currency: string;
  title: string;
  description?: ReactNode;
  collections: { slug: string; title: string }[];
  /** Null on the full catalogue, which the "All" chip stands for. */
  activeCollectionSlug: string | null;
  products: StorefrontProduct[];
  sort: CatalogSort;
  sortOptions: CatalogSort[];
  locale: Locale;
  t: Messages;
  emptyTitle: string;
  emptyHint: string;
}) {
  const paths = storefrontPaths(storeSlug);
  const sortLabels: Record<CatalogSort, string> = {
    featured: t.catalog.featured,
    newest: t.catalog.newest,
    "price-asc": t.catalog.priceAsc,
    "price-desc": t.catalog.priceDesc,
    title: t.catalog.titleAsc,
  };

  const chips = [
    { href: paths.catalog, label: t.catalog.all, active: activeCollectionSlug === null },
    ...collections.map((collection) => ({
      href: paths.collection(collection.slug),
      label: collection.title,
      active: collection.slug === activeCollectionSlug,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-muted text-pretty">{description}</p>
      ) : null}

      {collections.length > 0 ? (
        <nav aria-label={t.home.collections} className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1">
            {chips.map((chip) => (
              <li key={chip.href} className="shrink-0">
                <Link
                  href={chip.href}
                  aria-current={chip.active ? "page" : undefined}
                  className={cn(
                    "block rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    chip.active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-strong hover:border-foreground",
                  )}
                >
                  {chip.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {plural(locale, products.length, t.catalog.productCount)}
        </p>
        {products.length > 1 ? (
          <SortMenu
            value={sort}
            label={t.catalog.sort}
            options={sortOptions.map((value) => ({ value, label: sortLabels[value] }))}
          />
        ) : null}
      </div>

      <div className="mt-4">
        {products.length === 0 ? (
          <EmptyCatalog title={emptyTitle} hint={emptyHint} />
        ) : (
          <ProductGrid
            products={products}
            storeSlug={storeSlug}
            currency={currency}
            locale={locale}
            t={t.product}
          />
        )}
      </div>
    </div>
  );
}
