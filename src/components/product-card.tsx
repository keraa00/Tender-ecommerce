import Image from "next/image";
import Link from "next/link";

import { formatMoney } from "@/lib/money";
import {
  isSoldOut,
  priceRange,
  type StorefrontProduct,
} from "@/lib/products/queries";

export function ProductCard({
  product,
  storeSlug,
}: {
  product: StorefrontProduct;
  storeSlug: string;
}) {
  const image = product.images[0];
  const price = priceRange(product);
  const soldOut = isSoldOut(product);

  return (
    <Link href={`/s/${storeSlug}/p/${product.slug}`} className="group block">
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
            No photo
          </div>
        )}

        {soldOut && (
          <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            Sold out
          </span>
        )}
      </div>

      <h3 className="mt-3 text-sm font-medium tracking-tight group-hover:underline underline-offset-4">
        {product.title}
      </h3>

      {price && (
        <p className="mt-0.5 text-sm text-muted tabular">
          {price.varies ? `From ${formatMoney(price.min)}` : formatMoney(price.min)}
        </p>
      )}
    </Link>
  );
}
