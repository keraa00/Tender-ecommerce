import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { ProductStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath } from "@/lib/admin/links";
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.products.title} · ${store.name}` };
}

export default async function ProductsPage(
  props: PageProps<"/dashboard/[storeSlug]/products">,
) {
  const { storeSlug } = await props.params;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const [{ store }, { t: messages, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.products;
  const number = new Intl.NumberFormat(intl);

  const products = await listStoreProducts(store.id);

  return (
    <AdminPage
      title={t.title}
      description={
        products.length === 0 ? t.empty : plural(locale, products.length, t.count)
      }
      action={
        products.length > 0 ? (
          <ButtonLink
            href={storeAdminPath(store.slug, "products/new")}
            size="sm"
          >
            {t.newProduct}
          </ButtonLink>
        ) : null
      }
    >
      {products.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          action={
            <ButtonLink
              href={storeAdminPath(store.slug, "products/new")}
              size="lg"
            >
              {t.addFirst}
            </ButtonLink>
          }
        >
          {t.emptyBody}
        </EmptyState>
      ) : (
        <Rows>
          {products.map((product) => {
            const image = product.images[0];
            const price = priceRange(product);
            const stock = totalInventory(product);

            return (
              <li key={product.id}>
                <Link
                  href={storeAdminPath(store.slug, `products/${product.id}`)}
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
                        {t.noPhoto}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{product.title}</p>
                    <p className="truncate text-sm text-muted tabular">
                      {price
                        ? price.varies
                          ? format(t.from, { price: formatMoney(price.min, store.currency, intl) })
                          : formatMoney(price.min, store.currency, intl)
                        : t.noPrice}
                      {" · "}
                      {format(t.inStock, { count: number.format(stock) })}
                    </p>
                  </div>

                  <ProductStatusBadge status={product.status} />
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </AdminPage>
  );
}
