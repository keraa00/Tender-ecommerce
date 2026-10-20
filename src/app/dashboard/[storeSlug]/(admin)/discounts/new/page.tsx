import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { DiscountForm } from "@/components/discounts/discount-form";
import { storeAdminPath } from "@/lib/admin/links";
import { createDiscountAction } from "@/lib/discounts/actions";
import { blankDiscountFormValues } from "@/lib/discounts/form-values";
import { discountFormOptions } from "@/lib/discounts/options";
import { getStoreContext } from "@/lib/stores/context";

export const metadata: Metadata = { title: "New discount" };

export default async function NewDiscountPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts/new">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const options = await discountFormOptions(store.id);
  // Bound server-side, so the tenant is never read from the submitted body.
  const action = createDiscountAction.bind(null, storeSlug);
  const now = new Date();

  return (
    <AdminPage
      title="New discount"
      description="Choose what it gives, who it is for and when it runs."
      back={{ href: storeAdminPath(storeSlug, "discounts"), label: "Discounts" }}
    >
      <DiscountForm
        action={action}
        initialValues={blankDiscountFormValues(now)}
        options={options}
        submitLabel="Save discount"
        now={now.toISOString()}
        currency={store.currency}
      />
    </AdminPage>
  );
}
