import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { ZoneForm } from "@/components/shipping/zone-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { COUNTRY_CODES, countryOptions } from "@/lib/address/countries";
import { storeAdminPath } from "@/lib/admin/links";
import { deleteZoneAction, updateZoneAction } from "@/lib/shipping/actions";
import { describeRateCondition, formatEstimate, formatRatePrice } from "@/lib/shipping/format";
import { getShippingZone, zoneCountryOwners } from "@/lib/shipping/queries";
import { getStoreContext } from "@/lib/stores/context";

// Shared by the metadata and the page, which render in the same request.
const loadZone = cache(async (storeSlug: string, zoneId: string) => {
  const { store } = await getStoreContext(storeSlug);
  // `storeId` is part of the lookup, so another store's zone id 404s.
  return { store, zone: await getShippingZone(store.id, zoneId) };
});

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]">,
): Promise<Metadata> {
  const { storeSlug, zoneId } = await props.params;
  const { store, zone } = await loadZone(storeSlug, zoneId);
  return { title: zone ? `${zone.name} · Shipping · ${store.name}` : "Shipping zone" };
}

export default async function ZonePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]">,
) {
  const { storeSlug, zoneId } = await props.params;
  const { created, rate, error } = await props.searchParams;
  const { store, zone } = await loadZone(storeSlug, zoneId);
  if (!zone) notFound();

  const taken = await zoneCountryOwners(store.id, zone.id);
  const path = (tail = "") => storeAdminPath(storeSlug, `settings/shipping/zones/${zone.id}${tail}`);
  const restOfWorld = zone.restOfWorld === true;

  return (
    <AdminPage
      title={zone.name}
      back={{ href: storeAdminPath(storeSlug, "settings/shipping"), label: "Shipping and delivery" }}
      description={
        restOfWorld
          ? "Every country your other zones don't cover."
          : `${zone.countries.length} ${zone.countries.length === 1 ? "country" : "countries"}`
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>Could not delete the zone. Please try again.</FormError>
        </div>
      ) : null}

      <ZoneForm
        action={updateZoneAction.bind(null, storeSlug, zone.id)}
        countries={countryOptions(COUNTRY_CODES, "en")}
        taken={taken}
        zone={{
          name: zone.name,
          countries: zone.countries.map((country) => ({
            countryCode: country.countryCode,
            regionCodes: country.regionCodes,
          })),
        }}
        restOfWorld={restOfWorld}
        submitLabel="Save zone"
        initialNotice={
          created ? "Zone created. Add a rate so buyers here can check out." : rate === "created" ? "Rate added." : undefined
        }
      />

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Rates</h2>
            <p className="text-sm text-muted">
              Buyers pick from the rates their order qualifies for.
            </p>
          </div>
          <ButtonLink href={path("/rates/new")} variant="secondary" size="sm">
            Add rate
          </ButtonLink>
        </div>

        <div className="mt-4">
          {zone.rates.length === 0 ? (
            <EmptyState title="No rates yet">
              Buyers in this zone see “no shipping options” until it has a rate.
            </EmptyState>
          ) : (
            <Rows>
              {zone.rates.map((entry) => {
                const details = [
                  formatEstimate(entry),
                  describeRateCondition(entry, store.currency),
                ].filter(Boolean);
                return (
                  <li key={entry.id}>
                    <Link
                      href={path(`/rates/${entry.id}`)}
                      className="flex items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">{entry.name}</p>
                        <p className="text-sm text-muted">
                          {details.length > 0 ? details.join(" · ") : "Every order"}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium tabular">
                        {formatRatePrice(entry.priceCents, store.currency)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </Rows>
          )}
        </div>
      </section>

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          Delete this zone
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          Its rates go with it, and buyers in{" "}
          {restOfWorld ? "the countries it covered" : "its countries"} can no longer check
          out anything that ships. Past orders keep the rate they were charged.
        </p>
        <form action={deleteZoneAction.bind(null, storeSlug, zone.id)} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            Delete zone
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
