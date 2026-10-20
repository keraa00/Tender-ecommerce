import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { ZoneForm } from "@/components/shipping/zone-form";
import { COUNTRY_CODES, countryOptions } from "@/lib/address/countries";
import { storeAdminPath } from "@/lib/admin/links";
import { createZoneAction } from "@/lib/shipping/actions";
import { listShippingZones, zoneCountryOwners } from "@/lib/shipping/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/new">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `New shipping zone · ${store.name}` };
}

export default async function NewZonePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/new">,
) {
  const { storeSlug } = await props.params;
  const { kind } = await props.searchParams;
  const { store } = await getStoreContext(storeSlug);

  const [zones, taken] = await Promise.all([
    listShippingZones(store.id),
    zoneCountryOwners(store.id),
  ]);
  // A second rest-of-world zone is refused by the database; asking for one
  // when it exists gets an ordinary zone instead.
  const restOfWorld = kind === "rest-of-world" && !zones.some((zone) => zone.restOfWorld);

  return (
    <AdminPage
      title={restOfWorld ? "Rest of world" : "New shipping zone"}
      back={{ href: storeAdminPath(storeSlug, "settings/shipping"), label: "Shipping and delivery" }}
      description={
        restOfWorld
          ? "One set of rates for every country your other zones don't cover."
          : "A group of countries that share the same rates. Save the zone, then add its rates."
      }
    >
      <ZoneForm
        action={createZoneAction.bind(null, storeSlug, restOfWorld)}
        countries={countryOptions(COUNTRY_CODES, "en")}
        taken={taken}
        restOfWorld={restOfWorld}
        submitLabel="Save zone"
      />
    </AdminPage>
  );
}
