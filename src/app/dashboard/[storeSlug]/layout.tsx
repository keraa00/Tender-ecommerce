import { getStoreContext } from "@/lib/stores/context";

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
