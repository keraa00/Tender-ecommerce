import Image from "next/image";
import Link from "next/link";

import { INTL_LOCALES, type Locale } from "@/lib/i18n/locales";
import { format, type Messages } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { isSoldOut, priceRange } from "@/lib/products/pricing";
import { storefrontPaths } from "@/lib/storefront/links";

export type ProductCardProduct = {
  id: string;
  slug: string;
  title: string;
  images: { url: string; altText: string | null }[];
  variants: {
    priceCents: number;
    compareAtPriceCents: number | null;
    inventoryQty: number;
  }[];
};

export function ProductCard({
  product,
  storeSlug,
  locale,
  t,
}: {
  product: ProductCardProduct;
  storeSlug: string;
  locale: Locale;
  t: Messages["product"];
}) {
  const image = product.images[0];
  const price = priceRange(product);
  const soldOut = isSoldOut(product);
  const onSale = product.variants.some(
    (variant) =>
      variant.compareAtPriceCents !== null &&
      variant.compareAtPriceCents > variant.priceCents,
  );
  const money = (cents: number) =>
    formatMoney(cents, undefined, INTL_LOCALES[locale]);

  // The struck-through price only makes sense against a single price.
  const compareAt =
    price && !price.varies
      ? product.variants.find((variant) => variant.priceCents === price.min)
          ?.compareAtPriceCents ?? null
      : null;

  return (
    <Link
      href={storefrontPaths(storeSlug).product(product.slug)}
      className="group block"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-subtle">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText ?? product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">
            {t.noPhoto}
          </div>
        )}

        {soldOut ? (
          <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            {t.soldOut}
          </span>
        ) : onSale ? (
          <span
            className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: "var(--store-accent)" }}
          >
            {t.sale}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-sm font-medium tracking-tight underline-offset-4 group-hover:underline">
        {product.title}
      </h3>

      {price ? (
        <p className="mt-0.5 text-sm text-muted tabular">
          {price.varies ? format(t.from, { price: money(price.min) }) : money(price.min)}
          {compareAt !== null && compareAt > price.min ? (
            <s className="ml-2 text-muted/70">{money(compareAt)}</s>
          ) : null}
        </p>
      ) : null}
    </Link>
  );
}
