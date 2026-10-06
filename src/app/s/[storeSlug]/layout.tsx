import Link from "next/link";
import { notFound } from "next/navigation";

import { StorefrontFrame } from "@/components/storefront/storefront-frame";
import { getStoreBySlug } from "@/lib/stores/queries";
import { isStorePubliclyVisible } from "@/lib/stores/policy";
import { getPublishedTheme } from "@/lib/theme/queries";

export default async function StorefrontLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  if (!isStorePubliclyVisible(store)) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-24 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            This store is unavailable
          </h1>
          <p className="mt-2 text-sm text-muted text-pretty">
            {store.name} has been suspended and is not currently trading.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            Browse other stores
          </Link>
        </div>
      </div>
    );
  }

  // Buyers only ever see the published theme.
  const theme = await getPublishedTheme(store.id);

  return (
    <StorefrontFrame store={store} theme={theme}>
      {children}
    </StorefrontFrame>
  );
}
