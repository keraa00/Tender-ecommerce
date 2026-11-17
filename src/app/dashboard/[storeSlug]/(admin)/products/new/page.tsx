import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { ProductForm } from "@/components/products/product-form";
import { storeAdminPath } from "@/lib/admin/links";
import { listCollectionOptions } from "@/lib/collections/queries";
import { getAdminI18n } from "@/lib/i18n/server";
import { createProductAction } from "@/lib/products/actions";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.products.newProduct };
}

export default async function NewProductPage(
  props: PageProps<"/dashboard/[storeSlug]/products/new">,
) {
  const { storeSlug } = await props.params;
  // Verifies membership before the form is even rendered.
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const collections = await listCollectionOptions(store.id);

  // The tenant is bound server-side, so the slug is never taken from the
  // submitted body — a forged store field in the form would change nothing.
  const action = createProductAction.bind(null, storeSlug);

  return (
    <AdminPage
      title={t.products.newProduct}
      description={t.products.new.description}
      back={{
        href: storeAdminPath(storeSlug, "products"),
        label: t.products.title,
      }}
    >
      <ProductForm
        action={action}
        collections={collections}
        submitLabel={t.products.new.submit}
        t={{ form: t.products.form, status: t.products.status, images: t.validation.images }}
      />
    </AdminPage>
  );
}
