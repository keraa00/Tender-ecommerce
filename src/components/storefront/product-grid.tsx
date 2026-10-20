import { ProductCard, type ProductCardProduct } from "@/components/product-card";
import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";

export function ProductGrid({
  products,
  storeSlug,
  currency,
  locale,
  t,
}: {
  products: ProductCardProduct[];
  storeSlug: string;
  currency: string;
  locale: Locale;
  t: Messages["product"];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          storeSlug={storeSlug}
          currency={currency}
          locale={locale}
          t={t}
        />
      ))}
    </div>
  );
}

export function EmptyCatalog({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">{hint}</p>
    </div>
  );
}
