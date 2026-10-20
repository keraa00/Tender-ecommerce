import type { Metadata } from "next";

import { CheckoutView } from "@/components/storefront/checkout-view";
import { CartKind } from "@/lib/db/types";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/checkout">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([getStoreBySlug(storeSlug), getStorefrontI18n()]);
  return {
    title: store ? `${t.checkout.title} · ${store.name}` : t.checkout.title,
    robots: { index: false },
  };
}

/** Checkout for the buyer's cart, from the drawer or the cart page. */
export default async function CheckoutPage(props: PageProps<"/s/[storeSlug]/checkout">) {
  const { storeSlug } = await props.params;
  return <CheckoutView storeSlug={storeSlug} kind={CartKind.STANDARD} />;
}
