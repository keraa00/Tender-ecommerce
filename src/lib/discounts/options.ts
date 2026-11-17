import "server-only";

import type { DiscountFormCopy } from "@/components/discounts/discount-form";
import type { PickerOption } from "@/components/discounts/item-picker";
import { collectionProductOptions } from "@/lib/collections/options";
import { rootDb } from "@/lib/db/root";
import { listStoreCustomers } from "@/lib/customers/queries";
import { plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { AdminI18n } from "@/lib/i18n/server";

/** How many past customers the eligibility picker offers by name. */
const CUSTOMER_SUGGESTIONS = 200;

export type DiscountFormOptions = {
  products: PickerOption[];
  collections: PickerOption[];
  customers: PickerOption[];
};

/** Everything the discount form's pickers choose from, for one store. */
export async function discountFormOptions(
  storeId: string,
  { locale, t }: AdminI18n,
): Promise<DiscountFormOptions> {
  const [products, collections, customers] = await Promise.all([
    collectionProductOptions(storeId, t.products.status),
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
      detail: plural(locale, collection._count.products, t.collections.products),
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

/** The discount form's share of the admin copy, picked on the server. */
export function discountFormCopy(t: AdminMessages): DiscountFormCopy {
  const { form, types, scopes, buysFrom, minimums, eligibilities, picker } = t.discounts;
  return {
    form,
    types,
    scopes,
    buysFrom,
    minimums,
    eligibilities,
    picker,
    format: t.discountFormat,
    segments: t.segments,
  };
}
