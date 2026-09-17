import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/page-shell";
import { ProductForm } from "@/components/products/product-form";
import { ProductStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { deleteProductAction, updateProductAction } from "@/lib/products/actions";
import { getStoreProduct } from "@/lib/products/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/products/[productId]">,
): Promise<Metadata> {
  const { storeSlug, productId } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  const product = await getStoreProduct(store.id, productId);

  return { title: product ? `${product.title} · Products` : "Product" };
}

export default async function EditProductPage(
  props: PageProps<"/dashboard/[storeSlug]/products/[productId]">,
) {
  const { storeSlug, productId } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  // `storeId` is part of the lookup, so another tenant's product id 404s here
  // rather than resolving and then being rejected later.
  const product = await getStoreProduct(store.id, productId);
  if (!product) notFound();

  const action = updateProductAction.bind(null, storeSlug, product.id);
  const destroy = deleteProductAction.bind(null, storeSlug, product.id);

  return (
    <AdminPage
      title={product.title}
      back={{
        href: storeAdminPath(storeSlug, "products"),
        label: "Products",
      }}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ProductStatusBadge status={product.status} />
          {product.status === "ACTIVE" ? (
            <Link
              href={`${storefrontUrl(storeSlug)}/p/${product.slug}`}
              className="text-muted underline-offset-4 hover:underline tabular"
            >
              /s/{storeSlug}/p/{product.slug} ↗
            </Link>
          ) : null}
        </span>
      }
    >
      <ProductForm
        action={action}
        submitLabel="Save changes"
        product={{
          title: product.title,
          slug: product.slug,
          description: product.description,
          status: product.status,
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
          })),
        }}
      />

      {/*
        Behind a disclosure rather than sitting next to Save: deleting takes the
        product off every past order line's variant reference, and it is not an
        action that should be one stray click away from the save button.
      */}
      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          Delete this product
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          Its options and photos go with it. Past orders keep their own copy of
          the title, price and image, so order history stays readable.
        </p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            Delete permanently
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
