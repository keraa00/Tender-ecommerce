import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { updateStoreSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Settings · ${store.name}` };
}

export default async function StoreSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  const action = updateStoreSettingsAction.bind(null, storeSlug);

  return (
    <AdminPage
      title="Settings"
      description="How your store is marked in your store list and across this admin. Buyers don't see it."
    >
      <StoreSettingsForm
        action={action}
        store={{
          name: store.name,
          logoUrl: store.logoUrl,
          accentColor: store.accentColor,
        }}
      />
    </AdminPage>
  );
}
