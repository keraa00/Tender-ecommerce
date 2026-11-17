import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AdminPage } from "@/components/admin/page-shell";
import { RateForm, type RateFormValues } from "@/components/shipping/rate-form";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { getAdminI18n } from "@/lib/i18n/server";
import { centsToInputValue, currencySymbol } from "@/lib/money";
import { deleteRateAction, updateRateAction } from "@/lib/shipping/actions";
import { getShippingRate } from "@/lib/shipping/queries";
import { getStoreContext } from "@/lib/stores/context";
import { gramsToInputValue } from "@/lib/weight";

const loadRate = cache(async (storeSlug: string, zoneId: string, rateId: string) => {
  const { store } = await getStoreContext(storeSlug);
  // Scoped by store and zone, so a rate id from anywhere else 404s.
  return { store, rate: await getShippingRate(store.id, zoneId, rateId) };
});

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]/rates/[rateId]">,
): Promise<Metadata> {
  const { storeSlug, zoneId, rateId } = await props.params;
  const [{ store, rate }, { t }] = await Promise.all([
    loadRate(storeSlug, zoneId, rateId),
    getAdminI18n(),
  ]);
  return {
    title: rate
      ? `${rate.name} · ${rate.zone.name} · ${store.name}`
      : t.settings.shipping.rate.fallbackTitle,
  };
}

const money = (cents: number | null) => (cents === null ? "" : centsToInputValue(cents));
const kilos = (grams: number | null) => (grams === null ? "" : gramsToInputValue(grams));
const days = (value: number | null) => (value === null ? "" : String(value));

export default async function RatePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]/rates/[rateId]">,
) {
  const { storeSlug, zoneId, rateId } = await props.params;
  const { error } = await props.searchParams;
  const [{ store, rate }, { t: messages, intl }] = await Promise.all([
    loadRate(storeSlug, zoneId, rateId),
    getAdminI18n(),
  ]);
  if (!rate) notFound();
  const t = messages.settings.shipping;

  const values: RateFormValues = {
    name: rate.name,
    price: centsToInputValue(rate.priceCents),
    minDays: days(rate.minDeliveryDays),
    maxDays: days(rate.maxDeliveryDays),
    condition:
      rate.minSubtotalCents !== null || rate.maxSubtotalCents !== null
        ? "subtotal"
        : rate.minWeightGrams !== null || rate.maxWeightGrams !== null
          ? "weight"
          : "none",
    minSubtotal: money(rate.minSubtotalCents),
    maxSubtotal: money(rate.maxSubtotalCents),
    minWeight: kilos(rate.minWeightGrams),
    maxWeight: kilos(rate.maxWeightGrams),
  };

  return (
    <AdminPage
      title={rate.name}
      back={{
        href: storeAdminPath(storeSlug, `settings/shipping/zones/${rate.zone.id}`),
        label: rate.zone.name,
      }}
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>{t.rate.deleteFailed}</FormError>
        </div>
      ) : null}

      <RateForm
        action={updateRateAction.bind(null, storeSlug, rate.zone.id, rate.id)}
        initialValues={values}
        currencySymbol={currencySymbol(store.currency, intl)}
        submitLabel={messages.common.saveChanges}
        t={t.rateForm}
      />

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          {t.rate.deleteTitle}
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">{t.rate.deleteBody}</p>
        <form action={deleteRateAction.bind(null, storeSlug, rate.zone.id, rate.id)} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            {t.rate.deleteButton}
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
