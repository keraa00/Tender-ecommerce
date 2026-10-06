import Link from "next/link";

import { EmptyCatalog, ProductGrid } from "@/components/storefront/product-grid";
import { format } from "@/lib/i18n/messages";
import { en } from "@/lib/i18n/messages/en";
import { defineSection } from "../define";
import { field, textOr } from "../fields";

/**
 * A grid of products: the newest in the store, or the newest in one
 * collection. The default theme's "New arrivals" is one of these.
 */
export default defineSection({
  type: "product-grid",
  name: "Product grid",
  description: "Your newest products, from the store or one collection.",
  layout: "contained",
  maxPerPage: 4,
  settings: {
    heading: field.text({
      label: "Heading",
      maxLength: 80,
      placeholder: en.home.newArrivals,
    }),
    collectionId: field.collection({
      label: "Collection",
      help: "Leave empty to show the newest products in the store.",
    }),
    limit: field.range({
      label: "Products to show",
      min: 2,
      max: 24,
      default: 8,
    }),
    showViewAll: field.checkbox({
      label: "Show “View all” when there are more",
      default: true,
    }),
  },
  async Component({ section, ctx }) {
    const { settings } = section;
    const { t, paths } = ctx;

    // A chosen collection with nothing on sale has no page to send "View all"
    // to, and no products to show either way.
    const collection = settings.collectionId
      ? (await ctx.data.collections()).find(
          (entry) => entry.id === settings.collectionId,
        )
      : undefined;
    const products =
      settings.collectionId && !collection
        ? []
        : // One extra tells us whether "View all" leads anywhere new.
          await ctx.data.products({
            limit: settings.limit + 1,
            collectionId: collection?.id,
          });

    const hasMore = settings.showViewAll && products.length > settings.limit;
    const viewAllHref = collection ? paths.collection(collection.slug) : paths.catalog;
    const headingId = `${section.id}-heading`;

    return (
      <section aria-labelledby={headingId}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">
            {textOr(settings.heading, t.home.newArrivals)}
          </h2>
          {hasMore ? (
            <Link
              href={viewAllHref}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {t.home.viewAll}{" "}
              <span aria-hidden className="inline-block rtl:-scale-x-100">
                →
              </span>
            </Link>
          ) : null}
        </div>

        <div className="mt-5">
          {products.length === 0 ? (
            <EmptyCatalog
              title={t.catalog.empty}
              hint={format(t.catalog.emptyHint, { store: ctx.store.name })}
            />
          ) : (
            <ProductGrid
              products={products.slice(0, settings.limit)}
              storeSlug={ctx.store.slug}
              locale={ctx.locale}
              t={t.product}
            />
          )}
        </div>
      </section>
    );
  },
});
