import type { Metadata } from "next";

import {
  AdminPage,
  EmptyState,
  Row,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { getStoreTotals, listTopProducts } from "@/lib/analytics/queries";
import { daysAgo } from "@/lib/dates";
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

const WINDOW_DAYS = 30;

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/analytics">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.analytics.title} · ${store.name}` };
}

export default async function AnalyticsPage(
  props: PageProps<"/dashboard/[storeSlug]/analytics">,
) {
  const { storeSlug } = await props.params;
  const [{ store }, { t: messages, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.analytics;
  const money = (cents: number) => formatMoney(cents, store.currency, intl);
  const number = new Intl.NumberFormat(intl);
  const days = number.format(WINDOW_DAYS);

  const since = daysAgo(WINDOW_DAYS);

  const [window, allTime, topProducts] = await Promise.all([
    getStoreTotals(store.id, since),
    getStoreTotals(store.id),
    listTopProducts(store.id, since),
  ]);

  return (
    <AdminPage
      title={t.title}
      description={format(t.description, { days })}
    >
      <StatGrid>
        <Stat label={t.revenue} value={money(window.grossCents)} />
        <Stat label={t.orders} value={number.format(window.orders)} />
        <Stat
          label={t.averageOrder}
          value={window.averageOrderCents === null ? "—" : money(window.averageOrderCents)}
        />
        <Stat
          label={t.earnings}
          value={money(window.netCents)}
          hint={format(t.commission, { amount: money(window.feeCents) })}
        />
      </StatGrid>

      <section className="mt-8">
        <h2 className="text-lg font-medium tracking-tight">{t.bestSellers}</h2>
        <p className="mt-1 text-sm text-muted">{format(t.bestSellersHint, { days })}</p>

        <div className="mt-4">
          {topProducts.length === 0 ? (
            <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>
          ) : (
            <Rows>
              {topProducts.map((product, index) => (
                <Row key={product.title}>
                  <span
                    aria-hidden
                    className="w-5 shrink-0 text-sm text-muted tabular"
                  >
                    {number.format(index + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{product.title}</p>
                    <p className="text-sm text-muted tabular">
                      {format(t.sold, { count: number.format(product.units) })}
                    </p>
                  </div>
                  <div className="shrink-0 text-end font-medium tabular">
                    {money(product.revenueCents)}
                  </div>
                </Row>
              ))}
            </Rows>
          )}
        </div>
      </section>

      <div className="mt-8 rounded-xl border border-border bg-surface-subtle p-5">
        <h3 className="text-sm font-medium">{t.allTime}</h3>
        <p className="mt-1 text-sm text-muted text-pretty tabular">
          {plural(locale, allTime.orders, t.allTimeSummary, {
            gross: money(allTime.grossCents),
            net: money(allTime.netCents),
            fee: money(allTime.feeCents),
          })}
        </p>
      </div>
    </AdminPage>
  );
}
