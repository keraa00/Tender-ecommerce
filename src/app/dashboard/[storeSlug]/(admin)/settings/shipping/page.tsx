import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { countryName } from "@/lib/address/countries";
import { storeAdminPath } from "@/lib/admin/links";
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n, type AdminI18n } from "@/lib/i18n/server";
import { formatRatePrice } from "@/lib/shipping/format";
import { countUnweightedVariants, listShippingZones, toZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere, shipsTo } from "@/lib/shipping/rates";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.settings.shipping.title} · ${t.nav.settings} · ${store.name}` };
}

/** "Norway, Sweden, Denmark and 2 more", in the seller's language. */
function countrySummary(codes: string[], { t, intl }: AdminI18n): string {
  const names = codes.map((code) => countryName(code, intl)).sort((a, b) => a.localeCompare(b, intl));
  if (names.length <= 3) return names.join(", ");
  return format(t.settings.shipping.andMore, {
    names: names.slice(0, 3).join(", "),
    count: new Intl.NumberFormat(intl).format(names.length - 3),
  });
}

export default async function ShippingSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping">,
) {
  const { storeSlug } = await props.params;
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const { locale, intl } = i18n;
  const t = i18n.t.settings.shipping;
  const price = (cents: number) =>
    formatRatePrice(cents, store.currency, { locale, intl, t: i18n.t.shippingFormat });

  const [zones, unweighted] = await Promise.all([
    listShippingZones(store.id),
    countUnweightedVariants(store.id),
  ]);
  const rules = toZoneRules(zones);
  const coverage = shipsTo(rules);
  const live = shipsAnywhere(rules);
  const hasRestOfWorld = zones.some((zone) => zone.restOfWorld);
  const usesWeight = zones.some((zone) =>
    zone.rates.some((rate) => rate.minWeightGrams !== null || rate.maxWeightGrams !== null),
  );
  const path = (tail = "") => storeAdminPath(storeSlug, `settings/shipping${tail}`);

  const headline = coverage.everywhere
    ? t.everywhere
    : coverage.countryCodes.length === 0
      ? t.nowhere
      : plural(locale, coverage.countryCodes.length, t.countries);

  return (
    <AdminPage
      title={t.title}
      description={t.description}
      action={
        <ButtonLink href={path("/zones/new")} size="sm">
          {t.addZone}
        </ButtonLink>
      }
    >
      <section className="rounded-xl border border-border bg-surface-subtle p-5">
        <h2 className="text-lg font-medium tracking-tight">{headline}</h2>
        <p className="mt-1 text-sm text-muted text-pretty">
          {coverage.everywhere
            ? t.everywhereHint
            : coverage.countryCodes.length === 0
              ? t.nowhereHint
              : countrySummary(coverage.countryCodes, i18n)}
        </p>
        {!live && zones.length > 0 ? (
          <p className="mt-2 text-sm text-warning">
            {t.noRatesWarning}
          </p>
        ) : null}
      </section>

      <div className="mt-6">
        {zones.length === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            action={
              <ButtonLink href={path("/zones/new")} size="sm">
                {t.addFirstZone}
              </ButtonLink>
            }
          >
            {t.emptyBody}
          </EmptyState>
        ) : (
          <Rows>
            {zones.map((zone) => {
              const prices = zone.rates.map((rate) => rate.priceCents);
              return (
                <li key={zone.id}>
                  <Link
                    href={path(`/zones/${zone.id}`)}
                    className="flex items-start gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="min-w-0 break-words">{zone.name}</span>
                        {zone.restOfWorld ? <Badge>{t.restOfWorld}</Badge> : null}
                      </p>
                      <p className="text-sm text-muted text-pretty">
                        {zone.restOfWorld
                          ? t.everyOtherCountry
                          : countrySummary(
                              zone.countries.map((country) => country.countryCode),
                              i18n,
                            )}
                      </p>
                    </div>
                    <div className="shrink-0 text-end text-sm">
                      {zone.rates.length === 0 ? (
                        <span className="text-warning">{t.noRates}</span>
                      ) : (
                        <>
                          <p className="tabular">
                            {Math.min(...prices) === Math.max(...prices)
                              ? price(prices[0])
                              : `${price(Math.min(...prices))} – ${price(Math.max(...prices))}`}
                          </p>
                          <p className="text-muted">
                            {plural(locale, zone.rates.length, t.rates)}
                          </p>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </Rows>
        )}
      </div>

      {!hasRestOfWorld ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong px-4 py-3">
          <p className="min-w-0 text-sm text-muted text-pretty">
            {t.restOfWorldPrompt}
          </p>
          <ButtonLink href={`${path("/zones/new")}?kind=rest-of-world`} variant="secondary" size="sm">
            {t.addRestOfWorld}
          </ButtonLink>
        </div>
      ) : null}

      {usesWeight && unweighted > 0 ? (
        <p className="mt-6 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning text-pretty">
          {plural(locale, unweighted, t.unweighted)}{" "}
          <Link href={storeAdminPath(storeSlug, "products")} className="underline underline-offset-4">
            {t.reviewProducts}
          </Link>
        </p>
      ) : null}

      <p className="mt-6 text-sm text-muted text-pretty">
        {t.checkoutNote}
      </p>
    </AdminPage>
  );
}
