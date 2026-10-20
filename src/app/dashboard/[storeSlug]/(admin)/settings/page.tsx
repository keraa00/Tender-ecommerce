import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { SUPPORTED_CURRENCIES, currencyLabel } from "@/lib/currencies";
import { rootDb } from "@/lib/db/root";
import { updateStoreSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";
import { canChangeCurrency } from "@/lib/stores/policy";
import { getStoreContactEmail } from "@/lib/stores/queries";

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
  const { store } = await getStoreContext(storeSlug);

  const [orderCount, ownerEmail] = await Promise.all([
    rootDb.order.count({ where: { storeId: store.id } }),
    getStoreContactEmail(store.id, { ownerOnly: true }),
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
    </AdminPage>
  );
}
