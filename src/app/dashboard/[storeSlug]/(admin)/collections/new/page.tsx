import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { CollectionForm } from "@/components/collections/collection-form";
import { storeAdminPath } from "@/lib/admin/links";
import { createCollectionAction } from "@/lib/collections/actions";
import { collectionProductOptions } from "@/lib/collections/options";
import { getAdminI18n } from "@/lib/i18n/server";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.collections.newCollection };
}

export default async function NewCollectionPage(
  props: PageProps<"/dashboard/[storeSlug]/collections/new">,
) {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const products = await collectionProductOptions(store.id, t.products.status);
  // Bound server-side, so the tenant is never read from the submitted body.
  const action = createCollectionAction.bind(null, storeSlug);

  return (
    <AdminPage
      title={t.collections.newCollection}
      description={t.collections.new.description}
      back={{
        href: storeAdminPath(storeSlug, "collections"),
        label: t.collections.title,
      }}
    >
      <CollectionForm
        action={action}
        products={products}
        submitLabel={t.collections.new.submit}
        t={t.collections.form}
      />
    </AdminPage>
  );
}
