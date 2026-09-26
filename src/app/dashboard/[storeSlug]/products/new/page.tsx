import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { ProductForm } from "@/components/products/product-form";
import { storeAdminPath } from "@/lib/admin/links";
import { listCollectionOptions } from "@/lib/collections/queries";
import { createProductAction } from "@/lib/products/actions";
import { getStoreContext } from "@/lib/stores/context";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage(
  props: PageProps<"/dashboard/[storeSlug]/products/new">,
) {
  const { storeSlug } = await props.params;
  // Verifies membership before the form is even rendered.
  const { store } = await getStoreContext(storeSlug);
  const collections = await listCollectionOptions(store.id);

  // The tenant is bound server-side, so the slug is never taken from the
  // submitted body — a forged store field in the form would change nothing.
  const action = createProductAction.bind(null, storeSlug);

  return (
    <AdminPage
      title="New product"
      description="Save it as a draft while you work, then publish when it is ready."
      back={{
        href: storeAdminPath(storeSlug, "products"),
        label: "Products",
      }}
    >
      <ProductForm
        action={action}
        collections={collections}
        submitLabel="Save product"
      />
    </AdminPage>
  );
}
