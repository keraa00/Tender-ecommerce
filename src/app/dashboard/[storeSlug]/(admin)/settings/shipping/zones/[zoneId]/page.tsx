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
import { plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ store, zone }, { t }] = await Promise.all([loadZone(storeSlug, zoneId), getAdminI18n()]);
  const shipping = t.settings.shipping;
  return {
    title: zone ? `${zone.name} · ${shipping.shortTitle} · ${store.name}` : shipping.zone.fallbackTitle,
  };
}

export default async function ZonePage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping/zones/[zoneId]">,
) {
  const { storeSlug, zoneId } = await props.params;
  const { created, rate, error } = await props.searchParams;
  const [{ store, zone }, { t: messages, locale, intl }] = await Promise.all([
    loadZone(storeSlug, zoneId),
    getAdminI18n(),
  ]);
  if (!zone) notFound();
  const t = messages.settings.shipping;
  const describe = { locale, intl, t: messages.shippingFormat };

  const taken = await zoneCountryOwners(store.id, zone.id);
  const path = (tail = "") => storeAdminPath(storeSlug, `settings/shipping/zones/${zone.id}${tail}`);
  const restOfWorld = zone.restOfWorld === true;

  return (
    <AdminPage
      title={zone.name}
      back={{ href: storeAdminPath(storeSlug, "settings/shipping"), label: t.title }}
      description={
        restOfWorld
          ? t.zone.restOfWorldSummary
          : plural(locale, zone.countries.length, t.zone.countryCount)
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>{t.zone.deleteFailed}</FormError>
        </div>
      ) : null}

      <ZoneForm
        action={updateZoneAction.bind(null, storeSlug, zone.id)}
        countries={countryOptions(COUNTRY_CODES, intl)}
        taken={taken}
        zone={{
          name: zone.name,
          countries: zone.countries.map((country) => ({
            countryCode: country.countryCode,
            regionCodes: country.regionCodes,
          })),
        }}
        restOfWorld={restOfWorld}
        submitLabel={t.zone.save}
        initialNotice={
          created ? t.zone.created : rate === "created" ? t.zone.rateAdded : undefined
        }
        t={t.zoneForm}
      />

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium tracking-tight">{t.zone.rates}</h2>
            <p className="text-sm text-muted">{t.zone.ratesHint}</p>
          </div>
          <ButtonLink href={path("/rates/new")} variant="secondary" size="sm">
            {t.zone.addRate}
          </ButtonLink>
        </div>

        <div className="mt-4">
          {zone.rates.length === 0 ? (
            <EmptyState title={t.zone.noRatesTitle}>{t.zone.noRatesBody}</EmptyState>
          ) : (
            <Rows>
              {zone.rates.map((entry) => {
                const details = [
                  formatEstimate(entry, describe),
                  describeRateCondition(entry, store.currency, describe),
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
                          {details.length > 0 ? details.join(" · ") : t.zone.everyOrder}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium tabular">
                        {formatRatePrice(entry.priceCents, store.currency, describe)}
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
          {t.zone.deleteTitle}
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          {restOfWorld ? t.zone.deleteBodyRestOfWorld : t.zone.deleteBody}
        </p>
        <form action={deleteZoneAction.bind(null, storeSlug, zone.id)} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            {t.zone.deleteButton}
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
