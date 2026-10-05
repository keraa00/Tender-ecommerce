import { StoreShell } from "@/components/admin/store-shell";
import { StoreStatusBadge } from "@/components/ui/badge";
import { allStoresUrl, storefrontUrl } from "@/lib/admin/links";
import { StoreStatus } from "@/lib/db/types";
import { getStoreContext } from "@/lib/stores/context";

/**
 * One store's admin.
 *
 * Reached at `admin.<root>/<slug>/…` and rewritten onto this path by
 * `src/proxy.ts` — see `src/lib/admin/host.ts` for why the route tree kept its
 * old shape. The rewrite is not what makes this safe: membership is verified
 * here, once, for every page nested beneath.
 */
export default async function StoreAdminLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[storeSlug]">) {
  const { storeSlug } = await params;
  const { store, user } = await getStoreContext(storeSlug);

  return (
    <StoreShell
      store={{
        slug: store.slug,
        name: store.name,
        logoUrl: store.logoUrl,
        accentColor: store.accentColor,
      }}
      allStoresUrl={allStoresUrl()}
      storefrontUrl={storefrontUrl(store.slug)}
      userEmail={user.email}
      statusBadge={<StoreStatusBadge status={store.status} />}
      setupIncomplete={store.status === StoreStatus.PENDING}
    >
      {children}
    </StoreShell>
  );
}
