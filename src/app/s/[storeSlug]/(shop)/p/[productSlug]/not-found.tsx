import Link from "next/link";

import { getStorefrontI18n } from "@/lib/i18n/server";

/**
 * Without this, a missing product would fall through to the store-level 404,
 * which says the *store* does not exist. The link is relative — `..` from
 * `/s/<store>/p/<slug>` is the store's home — because a not-found boundary is
 * not handed the route params.
 */
export default async function ProductNotFound() {
  const { t } = await getStorefrontI18n();

  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {t.product.notFound}
        </h1>
        <p className="mt-2 text-sm text-muted text-pretty">{t.product.notFoundHint}</p>
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
