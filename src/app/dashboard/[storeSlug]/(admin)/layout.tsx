import { NewOrdersProvider } from "@/components/admin/new-orders";
import { StoreShell } from "@/components/admin/store-shell";
import { StoreStatusBadge } from "@/components/ui/badge";
import { allStoresUrl, storefrontUrl } from "@/lib/admin/links";
import { StoreStatus } from "@/lib/db/types";
import { listUnseenOrderIds } from "@/lib/orders/queries";
import { getStoreContext } from "@/lib/stores/context";

/**
 * The drawer every admin section is framed in. Membership has already been
 * proved by the store layout above; `getStoreContext` is cached per request,
 * so asking again here costs nothing.
 *
 * A route group, so the theme editor in `(editor)` can sit beside these pages
 * without the drawer. `useSelectedLayoutSegment()` in the shell still reports
 * `orders`, `products` and so on — groups are not segments.
 */
export default async function StoreAdminChromeLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[storeSlug]">) {
  const { storeSlug } = await params;
  const { store, user, membership } = await getStoreContext(storeSlug);
  const unseenOrderIds = await listUnseenOrderIds(store.id, membership.ordersSeenAt);

  return (
    <NewOrdersProvider
      storeId={store.id}
      storeSlug={store.slug}
      initial={{
        ids: unseenOrderIds,
        seenThroughMs: membership.ordersSeenAt.getTime(),
      }}
    >
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
    </NewOrdersProvider>
  );
}
