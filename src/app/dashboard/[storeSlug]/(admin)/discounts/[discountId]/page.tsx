import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminPage, Stat, StatGrid } from "@/components/admin/page-shell";
import { DiscountForm } from "@/components/discounts/discount-form";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { deleteDiscountAction, updateDiscountAction } from "@/lib/discounts/actions";
import { savedDiscountFormValues } from "@/lib/discounts/form-values";
import { discountFormCopy, discountFormOptions } from "@/lib/discounts/options";
import {
  discountPerformance,
  discountTargets,
  getStoreDiscount,
} from "@/lib/discounts/queries";
import { plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ discount }, { t }] = await Promise.all([
    loadDiscount(storeSlug, discountId),
    getAdminI18n(),
  ]);
  return {
    title: discount ? `${discount.title} · ${t.discounts.title}` : t.discounts.edit.fallbackTitle,
  };
}

export default async function EditDiscountPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts/[discountId]">,
) {
  const { storeSlug, discountId } = await props.params;
  const { error, created } = await props.searchParams;

  // `storeId` is part of the lookup, so another tenant's discount id 404s.
  const [{ store, discount }, i18n] = await Promise.all([
    loadDiscount(storeSlug, discountId),
    getAdminI18n(),
  ]);
  if (!discount) notFound();
  const { t: messages, locale, intl } = i18n;
  const t = messages.discounts.edit;
  const number = new Intl.NumberFormat(intl);

  const [options, performance] = await Promise.all([
    discountFormOptions(store.id, i18n),
    discountPerformance(store.id, discount.id),
  ]);

  const action = updateDiscountAction.bind(null, storeSlug, discount.id);
  const destroy = deleteDiscountAction.bind(null, storeSlug, discount.id);
  const now = new Date();

  return (
    <AdminPage
      title={discount.title}
      back={{ href: storeAdminPath(storeSlug, "discounts"), label: messages.discounts.title }}
      description={
        <>
          {discount.code ? (
            <code className="me-2 rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs font-medium ring-1 ring-border ring-inset">
              {discount.code}
            </code>
          ) : (
            t.automaticPrefix
          )}
          {messages.discounts.types[discount.type].label}
        </>
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>{t.deleteFailed}</FormError>
        </div>
      ) : null}

      <div className="mb-6">
        <StatGrid>
          <Stat
            label={t.uses}
            value={
              discount.usageLimit === null
                ? number.format(discount.usageCount)
                : `${number.format(discount.usageCount)} / ${number.format(discount.usageLimit)}`
            }
          />
          <Stat label={t.paidOrders} value={number.format(performance.paidOrders)} />
          <Stat
            label={t.discountGiven}
            value={formatMoney(performance.discountCents, store.currency, intl)}
          />
          <Stat
            label={t.sales}
            value={formatMoney(performance.salesCents, store.currency, intl)}
            hint={t.salesHint}
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
        submitLabel={messages.common.saveChanges}
        t={discountFormCopy(messages)}
        usageCount={discount.usageCount}
        now={now.toISOString()}
        initialNotice={created ? t.created : undefined}
        currency={store.currency}
      />

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          {t.deleteTitle}
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          {discount.usageCount > 0
            ? plural(locale, discount.usageCount, t.deleteUsed)
            : t.deleteUnused}
        </p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            {t.deleteButton}
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
