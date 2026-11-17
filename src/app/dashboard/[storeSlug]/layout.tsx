import type { Metadata } from "next";

import { getStoreContext } from "@/lib/stores/context";

/** Nothing behind sign-in, or on the way to it, belongs in search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One store's admin, whichever chrome it is drawn in.
 *
 * Reached at `admin.<root>/<slug>/…` and rewritten onto this path by
 * `src/proxy.ts` — see `src/lib/admin/host.ts` for why the route tree kept its
 * old shape. The rewrite is not what makes this safe: membership is verified
 * here, once, for every page nested beneath — the drawer-framed sections in
 * `(admin)` and the full-screen theme editor in `(editor)` alike.
 */
export default async function StoreLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[storeSlug]">) {
  const { storeSlug } = await params;
  await getStoreContext(storeSlug);

  return children;
}
