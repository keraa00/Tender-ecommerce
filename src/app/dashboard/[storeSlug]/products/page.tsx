import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ProductStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import {
  listStoreProducts,
  priceRange,
  totalInventory,
} from "@/lib/products/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/products">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Products · ${store.name}` };
}

export default async function ProductsPage(
  props: PageProps<"/dashboard/[storeSlug]/products">,
) {
  const { storeSlug } = await props.params;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const { store } = await getStoreContext(storeSlug);

  const products = await listStoreProducts(store.id);

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Products</h2>
          <p className="mt-1 text-sm text-muted">
            {products.length === 0
              ? "Your catalogue is empty."
              : `${products.length} ${products.length === 1 ? "product" : "products"} in your catalogue.`}
          </p>
        </div>
        {products.length > 0 ? (
          <ButtonLink href={`/dashboard/${storeSlug}/products/new`} size="sm">
            New product
          </ButtonLink>
        ) : null}
      </div>

      {products.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
          <h3 className="font-medium">Nothing to sell yet</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">
            Add a product with a photo, a price and some stock. You can save it
            as a draft and publish it when you are ready.
          </p>
          <ButtonLink
            href={`/dashboard/${storeSlug}/products/new`}
            className="mt-6"
            size="lg"
          >
            Add your first product
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {products.map((product) => {
            const image = product.images[0];
            const price = priceRange(product);
            const stock = totalInventory(product);

            return (
              <li key={product.id}>
                <Link
                  href={`/dashboard/${storeSlug}/products/${product.id}`}
                  className="flex items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-subtle">
                    {image ? (
                      <Image
                        src={image.url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-[10px] text-muted">
                        No photo
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{product.title}</p>
                    <p className="truncate text-sm text-muted tabular">
                      {price
                        ? price.varies
                          ? `From ${formatMoney(price.min)}`
                          : formatMoney(price.min)
                        : "No price"}
                      {" · "}
                      {stock} in stock
                    </p>
                  </div>

                  <ProductStatusBadge status={product.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
