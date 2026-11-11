import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { DeleteStoreForm } from "@/components/stores/delete-store-form";
import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { storeAdminPath } from "@/lib/admin/links";
import { SUPPORTED_CURRENCIES, currencyLabel } from "@/lib/currencies";
import { rootDb } from "@/lib/db/root";
import { deleteStoreAction, updateStoreSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";
import { describeStoreDeletionBlocker, storeDeletionBlockers } from "@/lib/stores/deletion";
import { canChangeCurrency, canDeleteStore } from "@/lib/stores/policy";
import { getStoreContactEmail, getStoreDeletionReview } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Settings · ${store.name}` };
}

export default async function GeneralSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
) {
  const { storeSlug } = await props.params;
  const { store, membership } = await getStoreContext(storeSlug);
  const mayDelete = canDeleteStore(membership);

  const [orderCount, ownerEmail, deletion] = await Promise.all([
    rootDb.order.count({ where: { storeId: store.id } }),
    getStoreContactEmail(store.id, { ownerOnly: true }),
    mayDelete ? getStoreDeletionReview(store.id) : null,
  ]);

  // A store whose currency is no longer offered still shows it, so the
  // select never silently swaps it for the first option.
  const codes: string[] = [...SUPPORTED_CURRENCIES];
  if (!codes.includes(store.currency)) codes.unshift(store.currency);

  return (
    <AdminPage title="General" description="Your store's details, and how buyers reach you.">
      <StoreSettingsForm
        action={updateStoreSettingsAction.bind(null, storeSlug)}
        store={{
          name: store.name,
          logoUrl: store.logoUrl,
          accentColor: store.accentColor,
          currency: store.currency,
          contactEmail: store.contactEmail,
        }}
        currencies={codes.map((code) => ({ code, label: currencyLabel(code) }))}
        currencyLocked={!canChangeCurrency({ orderCount })}
        ownerEmail={ownerEmail ?? "your account email"}
      />

      {deletion ? (
        <DeleteStoreForm
          action={deleteStoreAction.bind(null, storeSlug)}
          storeName={store.name}
          storeSlug={store.slug}
          blockers={storeDeletionBlockers({ ...deletion, paymentsInFlight: 0 }).map(
            describeStoreDeletionBlocker,
          )}
          ordersHref={storeAdminPath(storeSlug, "orders")}
          openCheckouts={deletion.openCheckouts.length}
          needsAttention={deletion.needsAttention}
        />
      ) : null}
    </AdminPage>
  );
}
