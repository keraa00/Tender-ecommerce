import Link from "next/link";

import { getStorefrontI18n } from "@/lib/i18n/server";

/**
 * A page inside a store that does not exist — in practice a collection: a
 * missing store is caught by the layout above, before this boundary, and a
 * missing product has a 404 of its own. Drawn inside the store's header and
 * footer, so it says the page is gone, not the store.
 *
 * The link is relative, like the product 404's: `..` from
 * `/s/<store>/collections/<slug>` is the store's home, and a not-found
 * boundary is not handed the route params.
 */
export default async function StorePageNotFound() {
  const { t } = await getStorefrontI18n();

  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{t.store.pageNotFound}</h1>
        <p className="mt-2 text-sm text-muted text-pretty">{t.store.pageNotFoundHint}</p>
        <Link
          href=".."
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
        >
          {t.cart.continueShopping}
        </Link>
      </div>
    </div>
  );
}
