import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { DeleteStoreForm } from "@/components/stores/delete-store-form";
import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { storeAdminPath } from "@/lib/admin/links";
import { SUPPORTED_CURRENCIES, currencyLabel } from "@/lib/currencies";
import { rootDb } from "@/lib/db/root";
import { getAdminI18n } from "@/lib/i18n/server";
import { deleteStoreAction, updateStoreSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";
import { describeStoreDeletionBlocker, storeDeletionBlockers } from "@/lib/stores/deletion";
import { canChangeCurrency, canDeleteStore } from "@/lib/stores/policy";
import { getStoreDeletionReview } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.nav.settings} · ${store.name}` };
}

export default async function GeneralSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
) {
  const { storeSlug } = await props.params;
  const [{ store, membership }, { t, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const mayDelete = canDeleteStore(membership);

  const [orderCount, deletion] = await Promise.all([
    rootDb.order.count({ where: { storeId: store.id } }),
    mayDelete ? getStoreDeletionReview(store.id) : null,
  ]);

  // A store whose currency is no longer offered still shows it, so the
  // select never silently swaps it for the first option.
  const codes: string[] = [...SUPPORTED_CURRENCIES];
  if (!codes.includes(store.currency)) codes.unshift(store.currency);

  return (
    <AdminPage title={t.settings.general.title} description={t.settings.general.description}>
      <StoreSettingsForm
        action={updateStoreSettingsAction.bind(null, storeSlug)}
        store={{
          name: store.name,
          logoUrl: store.logoUrl,
          accentColor: store.accentColor,
          currency: store.currency,
          contactEmail: store.contactEmail,
        }}
        currencies={codes.map((code) => ({ code, label: currencyLabel(code, intl) }))}
        currencyLocked={!canChangeCurrency({ orderCount })}
        t={{
          general: t.settings.general,
          logo: t.stores.logo,
          images: t.validation.images,
          saveChanges: t.common.saveChanges,
        }}
      />

      {deletion ? (
        <DeleteStoreForm
          action={deleteStoreAction.bind(null, storeSlug)}
          storeName={store.name}
          storeSlug={store.slug}
          blockers={storeDeletionBlockers({ ...deletion, paymentsInFlight: 0 }).map((blocker) =>
            describeStoreDeletionBlocker(blocker, locale, t.stores.deletionBlockers),
          )}
          t={t.settings.general.delete}
          ordersHref={storeAdminPath(storeSlug, "orders")}
          openCheckouts={deletion.openCheckouts.length}
          needsAttention={deletion.needsAttention}
        />
      ) : null}
    </AdminPage>
  );
}
