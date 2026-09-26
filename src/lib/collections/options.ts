import "server-only";

import type { CollectionProductOption } from "@/components/collections/collection-form";
import { ProductStatus } from "@/lib/db/types";
import { PRODUCT_STATUS_OPTIONS } from "@/lib/products/constants";
import { listStoreProducts } from "@/lib/products/queries";

/** Every product in the store, shaped for the collection form's picker. */
export async function collectionProductOptions(
  storeId: string,
): Promise<CollectionProductOption[]> {
  const products = await listStoreProducts(storeId);

  return products.map((product) => ({
    id: product.id,
    title: product.title,
    statusLabel:
      PRODUCT_STATUS_OPTIONS.find((option) => option.value === product.status)
        ?.label ?? product.status,
    published: product.status === ProductStatus.ACTIVE,
    imageUrl: product.images[0]?.url ?? null,
  }));
}
