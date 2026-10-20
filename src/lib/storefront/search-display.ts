import "server-only";

import type {
  SearchSuggestion,
  SearchSuggestions,
} from "@/components/storefront/types";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/locales";
import { format, MESSAGES, plural } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { isSoldOut, priceRange } from "@/lib/products/pricing";
import type { StorefrontProduct } from "@/lib/products/queries";
import { storefrontPaths } from "./links";

/**
 * Formats the header search's live results for the client, in the buyer's
 * language. Prices follow the product card: "From …" when options differ, and
 * a struck-through price only against a single one.
 */
export function toSearchSuggestions(
  query: string,
  products: Omit<StorefrontProduct, "position">[],
  total: number,
  store: { slug: string; currency: string },
  locale: Locale,
): SearchSuggestions {
  const t = MESSAGES[locale];
  const money = (cents: number) => formatMoney(cents, store.currency, INTL_LOCALES[locale]);
  const paths = storefrontPaths(store.slug);

  const suggestions = products.map((product): SearchSuggestion => {
    const image = product.images[0];
    const price = priceRange(product);
    const compareAt =
      price && !price.varies
        ? product.variants.find((variant) => variant.priceCents === price.min)
            ?.compareAtPriceCents ?? null
        : null;

    return {
      id: product.id,
      title: product.title,
      href: paths.product(product.slug),
      image: image ? { url: image.url, alt: image.altText ?? product.title } : null,
      price: price
        ? price.varies
          ? format(t.product.from, { price: money(price.min) })
          : money(price.min)
        : null,
      compareAt:
        price && compareAt !== null && compareAt > price.min ? money(compareAt) : null,
      soldOut: isSoldOut(product),
    };
  });

  return {
    query,
    suggestions,
    total,
    totalLabel: plural(locale, total, t.catalog.productCount),
  };
}
