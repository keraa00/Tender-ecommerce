import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { CheckoutSettingsForm } from "@/components/settings/checkout-settings-form";
import { updateCheckoutSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/checkout">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Checkout · Settings · ${store.name}` };
}

export default async function CheckoutSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/checkout">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  return (
    <AdminPage
      title="Checkout"
      description="Which details buyers are asked for when they check out."
    >
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
      />
    </AdminPage>
  );
}
