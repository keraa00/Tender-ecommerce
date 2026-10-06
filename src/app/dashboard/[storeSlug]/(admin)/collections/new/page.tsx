import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { CollectionForm } from "@/components/collections/collection-form";
import { storeAdminPath } from "@/lib/admin/links";
import { createCollectionAction } from "@/lib/collections/actions";
import { collectionProductOptions } from "@/lib/collections/options";
import { getStoreContext } from "@/lib/stores/context";

export const metadata: Metadata = { title: "New collection" };

export default async function NewCollectionPage(
  props: PageProps<"/dashboard/[storeSlug]/collections/new">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const products = await collectionProductOptions(store.id);
  // Bound server-side, so the tenant is never read from the submitted body.
  const action = createCollectionAction.bind(null, storeSlug);

  return (
    <AdminPage
      title="New collection"
      description="Pick the products that belong together and put them in order."
      back={{
        href: storeAdminPath(storeSlug, "collections"),
        label: "Collections",
      }}
    >
      <CollectionForm
        action={action}
        products={products}
        submitLabel="Save collection"
      />
    </AdminPage>
  );
}
