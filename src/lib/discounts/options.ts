import "server-only";

import type { PickerOption } from "@/components/discounts/item-picker";
import { collectionProductOptions } from "@/lib/collections/options";
import { rootDb } from "@/lib/db/root";
import { listStoreCustomers } from "@/lib/customers/queries";

/** How many past customers the eligibility picker offers by name. */
const CUSTOMER_SUGGESTIONS = 200;

export type DiscountFormOptions = {
  products: PickerOption[];
  collections: PickerOption[];
  customers: PickerOption[];
};

/** Everything the discount form's pickers choose from, for one store. */
export async function discountFormOptions(storeId: string): Promise<DiscountFormOptions> {
  const [products, collections, customers] = await Promise.all([
    collectionProductOptions(storeId),
    rootDb.collection.findMany({
      where: { storeId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, _count: { select: { products: true } } },
    }),
    listStoreCustomers(storeId, CUSTOMER_SUGGESTIONS),
  ]);

  return {
    products: products.map((product) => ({
      id: product.id,
      label: product.title,
      detail: product.published ? null : product.statusLabel,
      imageUrl: product.imageUrl,
    })),
    collections: collections.map((collection) => ({
      id: collection.id,
      label: collection.title,
      detail: `${collection._count.products} ${collection._count.products === 1 ? "product" : "products"}`,
    })),
    // Customers are keyed by email, lower-cased — the same form the discount
    // stores, so a suggestion and a typed address cannot both be chosen.
    customers: customers.map((customer) => ({
      id: customer.email.toLowerCase(),
      label: customer.name ?? customer.email,
      detail: customer.name ? customer.email : null,
    })),
  };
}
