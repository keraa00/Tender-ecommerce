import "server-only";

import type { CollectionProductOption } from "@/components/collections/collection-form";
import { ProductStatus } from "@/lib/db/types";
import type { AdminMessages } from "@/lib/i18n/admin";
import { listStoreProducts } from "@/lib/products/queries";

/** Every product in the store, shaped for the collection form's picker. */
export async function collectionProductOptions(
  storeId: string,
  statuses: AdminMessages["products"]["status"],
): Promise<CollectionProductOption[]> {
  const products = await listStoreProducts(storeId);

  return products.map((product) => ({
    id: product.id,
    title: product.title,
    statusLabel: statuses[product.status].label,
    published: product.status === ProductStatus.ACTIVE,
    imageUrl: product.images[0]?.url ?? null,
  }));
}
