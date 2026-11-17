import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage, Arrow } from "@/components/admin/page-shell";
import { ProductForm } from "@/components/products/product-form";
import { ProductStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { listCollectionOptions } from "@/lib/collections/queries";
import { getAdminI18n } from "@/lib/i18n/server";
import { deleteProductAction, updateProductAction } from "@/lib/products/actions";
import { getStoreProduct } from "@/lib/products/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/products/[productId]">,
): Promise<Metadata> {
  const { storeSlug, productId } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const product = await getStoreProduct(store.id, productId);

  return { title: product ? `${product.title} · ${t.products.title}` : t.products.edit.fallbackTitle };
}

export default async function EditProductPage(
  props: PageProps<"/dashboard/[storeSlug]/products/[productId]">,
) {
  const { storeSlug, productId } = await props.params;
  const { error } = await props.searchParams;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  // `storeId` is part of the lookup, so another tenant's product id 404s here
  // rather than resolving and then being rejected later.
  const [product, collections] = await Promise.all([
    getStoreProduct(store.id, productId),
    listCollectionOptions(store.id),
  ]);
  if (!product) notFound();

  const action = updateProductAction.bind(null, storeSlug, product.id);
  const destroy = deleteProductAction.bind(null, storeSlug, product.id);

  return (
    <AdminPage
      title={product.title}
      back={{
        href: storeAdminPath(storeSlug, "products"),
        label: t.products.title,
      }}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ProductStatusBadge status={product.status} />
          {product.status === "ACTIVE" ? (
            <Link
              href={`${storefrontUrl(storeSlug)}/p/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted underline-offset-4 hover:underline tabular"
            >
              <span dir="ltr">/s/{storeSlug}/p/{product.slug}</span> <Arrow>↗</Arrow>
            </Link>
          ) : null}
        </span>
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>{t.products.edit.deleteFailed}</FormError>
        </div>
      ) : null}

      <ProductForm
        action={action}
        submitLabel={t.common.saveChanges}
        t={{ form: t.products.form, status: t.products.status, images: t.validation.images }}
        collections={collections}
        product={{
          title: product.title,
          slug: product.slug,
          description: product.description,
          status: product.status,
          requiresShipping: product.requiresShipping,
          images: product.images.map((image) => ({
            id: image.id,
            url: image.url,
            altText: image.altText,
          })),
          variants: product.variants.map((variant) => ({
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            inventoryQty: variant.inventoryQty,
            weightGrams: variant.weightGrams,
          })),
          collectionIds: product.collections.map((entry) => entry.collectionId),
        }}
      />

      {/*
        Behind a disclosure rather than sitting next to Save: deleting takes the
        product off every past order line's variant reference, and it is not an
        action that should be one stray click away from the save button.
      */}
      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          {t.products.edit.deleteTitle}
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">{t.products.edit.deleteBody}</p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            {t.products.edit.deletePermanently}
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
