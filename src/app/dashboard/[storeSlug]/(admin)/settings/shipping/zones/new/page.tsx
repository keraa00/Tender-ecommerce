import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { ZoneForm } from "@/components/shipping/zone-form";
import { COUNTRY_CODES, countryOptions } from "@/lib/address/countries";
import { storeAdminPath } from "@/lib/admin/links";
import { createZoneAction } from "@/lib/shipping/actions";
import { listShippingZones, zoneCountryOwners } from "@/lib/shipping/queries";
import { getAdminI18n } from "@/lib/i18n/server";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/new">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.settings.shipping.zone.newTitle} · ${store.name}` };
}

export default async function NewZonePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/new">,
) {
  const { storeSlug } = await props.params;
  const { kind } = await props.searchParams;
  const [{ store }, { t: messages, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.settings.shipping;

  const [zones, taken] = await Promise.all([
    listShippingZones(store.id),
    zoneCountryOwners(store.id),
  ]);
  // A second rest-of-world zone is refused by the database; asking for one
  // when it exists gets an ordinary zone instead.
  const restOfWorld = kind === "rest-of-world" && !zones.some((zone) => zone.restOfWorld);

  return (
    <AdminPage
      title={restOfWorld ? t.restOfWorld : t.zone.newTitle}
      back={{ href: storeAdminPath(storeSlug, "settings/shipping"), label: t.title }}
      description={restOfWorld ? t.zone.restOfWorldDescription : t.zone.newDescription}
    >
      <ZoneForm
        action={createZoneAction.bind(null, storeSlug, restOfWorld)}
        countries={countryOptions(COUNTRY_CODES, intl)}
        taken={taken}
        restOfWorld={restOfWorld}
        submitLabel={t.zone.save}
        t={t.zoneForm}
      />
    </AdminPage>
  );
}
