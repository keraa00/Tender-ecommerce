import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminPage, Stat, StatGrid } from "@/components/admin/page-shell";
import { DiscountForm } from "@/components/discounts/discount-form";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { deleteDiscountAction, updateDiscountAction } from "@/lib/discounts/actions";
import { savedDiscountFormValues } from "@/lib/discounts/form-values";
import { discountTypeLabel } from "@/lib/discounts/constants";
import { discountFormOptions } from "@/lib/discounts/options";
import {
  discountPerformance,
  discountTargets,
  getStoreDiscount,
} from "@/lib/discounts/queries";
import { isUuid } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

async function loadDiscount(storeSlug: string, discountId: string) {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(discountId)) return { store, discount: null };
  return { store, discount: await getStoreDiscount(store.id, discountId) };
}

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/discounts/[discountId]">,
): Promise<Metadata> {
  const { storeSlug, discountId } = await props.params;
  const { discount } = await loadDiscount(storeSlug, discountId);
  return { title: discount ? `${discount.title} · Discounts` : "Discount" };
}

export default async function EditDiscountPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts/[discountId]">,
) {
  const { storeSlug, discountId } = await props.params;
  const { error, created } = await props.searchParams;

  // `storeId` is part of the lookup, so another tenant's discount id 404s.
  const { store, discount } = await loadDiscount(storeSlug, discountId);
  if (!discount) notFound();

  const [options, performance] = await Promise.all([
    discountFormOptions(store.id),
    discountPerformance(store.id, discount.id),
  ]);

  const action = updateDiscountAction.bind(null, storeSlug, discount.id);
  const destroy = deleteDiscountAction.bind(null, storeSlug, discount.id);
  const now = new Date();

  return (
    <AdminPage
      title={discount.title}
      back={{ href: storeAdminPath(storeSlug, "discounts"), label: "Discounts" }}
      description={
        <>
          {discount.code ? (
            <code className="mr-2 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs font-medium ring-1 ring-border ring-inset">
              {discount.code}
            </code>
          ) : (
            "Automatic · "
          )}
          {discountTypeLabel(discount.type)}
        </>
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>Could not delete the discount. Please try again.</FormError>
        </div>
      ) : null}

      <div className="mb-6">
        <StatGrid>
          <Stat
            label="Uses"
            value={
              discount.usageLimit === null
                ? String(discount.usageCount)
                : `${discount.usageCount} / ${discount.usageLimit}`
            }
          />
          <Stat label="Paid orders" value={String(performance.paidOrders)} />
          <Stat label="Discount given" value={formatMoney(performance.discountCents, store.currency)} />
          <Stat
            label="Sales"
            value={formatMoney(performance.salesCents, store.currency)}
            hint="Paid orders that used it"
          />
        </StatGrid>
      </div>

      <DiscountForm
        action={action}
        initialValues={savedDiscountFormValues(discount, {
          ...discountTargets(discount),
          customerEmails: discount.customers.map((customer) => customer.email),
        })}
        options={options}
        submitLabel="Save changes"
        usageCount={discount.usageCount}
        now={now.toISOString()}
        initialNotice={created ? "Discount created." : undefined}
        currency={store.currency}
      />

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          Delete this discount
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          {discount.usageCount > 0
            ? `It has been used ${discount.usageCount} ${discount.usageCount === 1 ? "time" : "times"}. Past orders keep what they were charged, but the record of who used it goes — so a one-per-customer code could be used again if you recreate it. To stop it and keep that history, switch it off instead.`
            : "It has not been used yet, so nothing else changes."}
        </p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            Delete discount
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
