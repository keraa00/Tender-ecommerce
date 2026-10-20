import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { countryName } from "@/lib/address/countries";
import { storeAdminPath } from "@/lib/admin/links";
import { formatRatePrice } from "@/lib/shipping/format";
import { countUnweightedVariants, listShippingZones, toZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere, shipsTo } from "@/lib/shipping/rates";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Shipping and delivery · Settings · ${store.name}` };
}

/** "Norway, Sweden, Denmark and 2 more". */
function countrySummary(codes: string[]): string {
  const names = codes.map((code) => countryName(code, "en")).sort((a, b) => a.localeCompare(b));
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export default async function ShippingSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/shipping">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

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
    ? "You ship to every country"
    : coverage.countryCodes.length === 0
      ? "You don't ship anywhere yet"
      : `You ship to ${coverage.countryCodes.length} ${coverage.countryCodes.length === 1 ? "country" : "countries"}`;

  return (
    <AdminPage
      title="Shipping and delivery"
      description="Where you deliver and what it costs. The countries buyers can choose at checkout are exactly the ones your zones cover."
      action={
        <ButtonLink href={path("/zones/new")} size="sm">
          Add zone
        </ButtonLink>
      }
    >
      <section className="rounded-xl border border-border bg-surface-subtle p-5">
        <h2 className="text-lg font-medium tracking-tight">{headline}</h2>
        <p className="mt-1 text-sm text-muted text-pretty">
          {coverage.everywhere
            ? "Your rest-of-world zone covers every country your other zones don't."
            : coverage.countryCodes.length === 0
              ? "Buyers can't check out anything that needs shipping until a zone has a rate. Digital products and services still sell."
              : countrySummary(coverage.countryCodes)}
        </p>
        {!live && zones.length > 0 ? (
          <p className="mt-2 text-sm text-warning">
            None of your zones has a rate yet, so nothing can be shipped.
          </p>
        ) : null}
      </section>

      <div className="mt-6">
        {zones.length === 0 ? (
          <EmptyState
            title="No shipping zones"
            action={
              <ButtonLink href={path("/zones/new")} size="sm">
                Add your first zone
              </ButtonLink>
            }
          >
            Group the countries you deliver to — your own country, your region, the
            rest of the world — and give each group its rates.
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
                        {zone.restOfWorld ? <Badge>Rest of world</Badge> : null}
                      </p>
                      <p className="text-sm text-muted text-pretty">
                        {zone.restOfWorld
                          ? "Every other country"
                          : countrySummary(zone.countries.map((country) => country.countryCode))}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {zone.rates.length === 0 ? (
                        <span className="text-warning">No rates</span>
                      ) : (
                        <>
                          <p className="tabular">
                            {Math.min(...prices) === Math.max(...prices)
                              ? formatRatePrice(prices[0], store.currency)
                              : `${formatRatePrice(Math.min(...prices), store.currency)} – ${formatRatePrice(Math.max(...prices), store.currency)}`}
                          </p>
                          <p className="text-muted">
                            {zone.rates.length} {zone.rates.length === 1 ? "rate" : "rates"}
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
            Ship everywhere else at one set of rates with a rest-of-world zone.
          </p>
          <ButtonLink href={`${path("/zones/new")}?kind=rest-of-world`} variant="secondary" size="sm">
            Add rest of world
          </ButtonLink>
        </div>
      ) : null}

      {usesWeight && unweighted > 0 ? (
        <p className="mt-6 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning text-pretty">
          {unweighted} published {unweighted === 1 ? "option has" : "options have"} no weight,
          so weight-based rates count {unweighted === 1 ? "it" : "them"} as 0 kg.{" "}
          <Link href={storeAdminPath(storeSlug, "products")} className="underline underline-offset-4">
            Review products
          </Link>
        </p>
      ) : null}

      <p className="mt-6 text-sm text-muted text-pretty">
        At checkout, buyers see the rates their order qualifies for and the cheapest is
        picked for them. A free-shipping discount takes the chosen rate to zero.
      </p>
    </AdminPage>
  );
}
