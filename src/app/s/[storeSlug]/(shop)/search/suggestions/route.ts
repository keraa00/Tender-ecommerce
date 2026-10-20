import type { NextRequest } from "next/server";

import { getStorefrontI18n } from "@/lib/i18n/server";
import { suggestStorefrontProducts } from "@/lib/products/queries";
import { normalizeSearchQuery } from "@/lib/products/search";
import { toSearchSuggestions } from "@/lib/storefront/search-display";
import { isStorePubliclyVisible } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";

/**
 * Live results for the storefront header's search field, fetched as the buyer
 * types. A GET route rather than a Server Action: actions run one at a time per
 * client, so a burst of keystrokes would queue behind each other, where these
 * requests can be cancelled as soon as the query moves on.
 *
 * Only published products are searched, and a suspended store answers like a
 * missing one — the same visibility rules as the storefront pages.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/s/[storeSlug]/search/suggestions">,
) {
  const { storeSlug } = await ctx.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store)) {
    return Response.json({ error: "Store not found" }, { status: 404 });
  }

  const query = normalizeSearchQuery(request.nextUrl.searchParams.get("q") ?? "");
  const [{ locale }, { products, total }] = await Promise.all([
    getStorefrontI18n(),
    suggestStorefrontProducts(store.id, query),
  ]);

  return Response.json(
    toSearchSuggestions(query, products, total, store, locale),
    // Prices and stock move, and the copy follows the buyer's language cookie.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
