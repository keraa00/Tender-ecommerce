import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/page-shell";
import { BLANK_RATE, RateForm } from "@/components/shipping/rate-form";
import { storeAdminPath } from "@/lib/admin/links";
import { getAdminI18n } from "@/lib/i18n/server";
import { currencySymbol } from "@/lib/money";
import { createRateAction } from "@/lib/shipping/actions";
import { getShippingZone } from "@/lib/shipping/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]/rates/new">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.settings.shipping.rate.newTitle} · ${store.name}` };
}

export default async function NewRatePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]/rates/new">,
) {
  const { storeSlug, zoneId } = await props.params;
  const [{ store }, { t: messages, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.settings.shipping;
  const zone = await getShippingZone(store.id, zoneId);
  if (!zone) notFound();

  return (
    <AdminPage
      title={t.rate.newTitle}
      back={{
        href: storeAdminPath(storeSlug, `settings/shipping/zones/${zone.id}`),
        label: zone.name,
      }}
    >
      <RateForm
        action={createRateAction.bind(null, storeSlug, zone.id)}
        initialValues={BLANK_RATE}
        currencySymbol={currencySymbol(store.currency, intl)}
        submitLabel={t.rate.save}
        t={t.rateForm}
      />
    </AdminPage>
  );
}
