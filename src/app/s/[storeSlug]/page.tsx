import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/product-card";
import { listStorefrontProducts } from "@/lib/products/queries";
import { getStoreBySlug } from "@/lib/stores/queries";

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
  const products = await listStorefrontProducts(store.id);

  return (
    <>
      {store.bannerUrl && (
        <div className="relative h-44 w-full overflow-hidden sm:h-64">
          <Image
            src={store.bannerUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {store.description && (
          <p className="max-w-2xl text-lg text-muted text-pretty">
            {store.description}
          </p>
        )}

        <div className="mt-8 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium tracking-tight">
            {products.length > 0
              ? `${products.length} ${products.length === 1 ? "product" : "products"}`
              : "Catalogue"}
          </h2>
        </div>

        {products.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
            <p className="font-medium">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
              {store.name} hasn&rsquo;t published any products. Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                storeSlug={store.slug}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
