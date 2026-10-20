import { notFound } from "next/navigation";

import { StorefrontFrame } from "@/components/storefront/storefront-frame";
import { getStoreBySlug } from "@/lib/stores/queries";
import { getPublishedTheme } from "@/lib/theme/queries";

/**
 * The storefront as buyers browse it: the published theme's header and footer
 * around every page, and the cart drawer. The store layout above has already
 * turned away missing and suspended stores; `getStoreBySlug` is cached per
 * request, so asking again costs nothing.
 */
export default async function ShopLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  // Buyers only ever see the published theme.
  const theme = await getPublishedTheme(store.id);

  return (
    <StorefrontFrame store={store} theme={theme}>
      {children}
    </StorefrontFrame>
  );
}
