import type { Metadata } from "next";

import { CheckoutView } from "@/components/storefront/checkout-view";
import { CartKind } from "@/lib/db/types";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/checkout/buy-now">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([getStoreBySlug(storeSlug), getStorefrontI18n()]);
  return {
    title: store ? `${t.checkout.title} · ${store.name}` : t.checkout.title,
    robots: { index: false },
  };
}

/**
 * Checkout for "Buy it now": the one item from the product page, in a cart of
 * its own, so the buyer's everyday cart is still there afterwards.
 */
export default async function BuyNowCheckoutPage(
  props: PageProps<"/s/[storeSlug]/checkout/buy-now">,
) {
  const { storeSlug } = await props.params;
  return <CheckoutView storeSlug={storeSlug} kind={CartKind.BUY_NOW} />;
}
