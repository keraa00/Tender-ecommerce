import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { CheckoutSettingsForm } from "@/components/settings/checkout-settings-form";
import { getAdminI18n } from "@/lib/i18n/server";
import { updateCheckoutSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/checkout">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.settings.checkout.title} · ${t.nav.settings} · ${store.name}` };
}

export default async function CheckoutSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/checkout">,
) {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  return (
    <AdminPage title={t.settings.checkout.title} description={t.settings.checkout.description}>
      <CheckoutSettingsForm
        action={updateCheckoutSettingsAction.bind(null, storeSlug)}
        settings={{
          checkoutPhone: store.checkoutPhone,
          checkoutCompany: store.checkoutCompany,
          checkoutFirstName: store.checkoutFirstName,
          checkoutAddress2: store.checkoutAddress2,
          checkoutMarketingOptIn: store.checkoutMarketingOptIn,
          checkoutOrderNote: store.checkoutOrderNote,
        }}
        t={t.settings.checkout}
        saveLabel={t.common.saveChanges}
      />
    </AdminPage>
  );
}
