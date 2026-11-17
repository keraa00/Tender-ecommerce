import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { DiscountForm } from "@/components/discounts/discount-form";
import { storeAdminPath } from "@/lib/admin/links";
import { createDiscountAction } from "@/lib/discounts/actions";
import { blankDiscountFormValues } from "@/lib/discounts/form-values";
import { discountFormCopy, discountFormOptions } from "@/lib/discounts/options";
import { getAdminI18n } from "@/lib/i18n/server";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.discounts.new.title };
}

export default async function NewDiscountPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts/new">,
) {
  const { storeSlug } = await props.params;
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const { t } = i18n;

  const options = await discountFormOptions(store.id, i18n);
  // Bound server-side, so the tenant is never read from the submitted body.
  const action = createDiscountAction.bind(null, storeSlug);
  const now = new Date();

  return (
    <AdminPage
      title={t.discounts.new.title}
      description={t.discounts.new.description}
      back={{ href: storeAdminPath(storeSlug, "discounts"), label: t.discounts.title }}
    >
      <DiscountForm
        action={action}
        initialValues={blankDiscountFormValues(now)}
        options={options}
        submitLabel={t.discounts.new.submit}
        t={discountFormCopy(t)}
        now={now.toISOString()}
        currency={store.currency}
      />
    </AdminPage>
  );
}
