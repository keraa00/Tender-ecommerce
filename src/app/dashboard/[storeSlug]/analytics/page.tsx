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
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

const WINDOW_DAYS = 30;

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/analytics">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Analytics · ${store.name}` };
}

export default async function AnalyticsPage(
  props: PageProps<"/dashboard/[storeSlug]/analytics">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const since = daysAgo(WINDOW_DAYS);

  const [window, allTime, topProducts] = await Promise.all([
    getStoreTotals(store.id, since),
    getStoreTotals(store.id),
    listTopProducts(store.id, since),
  ]);

  return (
    <AdminPage
      title="Analytics"
      description={`Settled orders over the last ${WINDOW_DAYS} days. Unpaid and cancelled orders are excluded.`}
    >
      <StatGrid>
        <Stat label="Revenue" value={formatMoney(window.grossCents)} />
        <Stat label="Orders" value={String(window.orders)} />
        <Stat
          label="Average order"
          value={
            window.averageOrderCents === null
              ? "—"
              : formatMoney(window.averageOrderCents)
          }
        />
        <Stat
          label="Your earnings"
          value={formatMoney(window.netCents)}
          hint={`${formatMoney(window.feeCents)} commission`}
        />
      </StatGrid>

      <section className="mt-8">
        <h2 className="text-lg font-medium tracking-tight">Best sellers</h2>
        <p className="mt-1 text-sm text-muted">
          By revenue, over the same {WINDOW_DAYS} days.
        </p>

        <div className="mt-4">
          {topProducts.length === 0 ? (
            <EmptyState title="Nothing sold yet">
              Once buyers start checking out, your best-selling products will be
              ranked here. Figures come from the price and title recorded on each
              order, so renaming a product later will not rewrite its history.
            </EmptyState>
          ) : (
            <Rows>
              {topProducts.map((product, index) => (
                <Row key={product.title}>
                  <span
                    aria-hidden
                    className="w-5 shrink-0 text-sm text-muted tabular"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{product.title}</p>
                    <p className="text-sm text-muted tabular">
                      {product.units} sold
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-medium tabular">
                    {formatMoney(product.revenueCents)}
                  </div>
                </Row>
              ))}
            </Rows>
          )}
        </div>
      </section>

      <div className="mt-8 rounded-xl border border-border bg-surface-subtle p-5">
        <h3 className="text-sm font-medium">All time</h3>
        <p className="mt-1 text-sm text-muted text-pretty tabular">
          {allTime.orders} settled{" "}
          {allTime.orders === 1 ? "order" : "orders"} ·{" "}
          {formatMoney(allTime.grossCents)} taken ·{" "}
          {formatMoney(allTime.netCents)} yours after{" "}
          {formatMoney(allTime.feeCents)} commission.
        </p>
      </div>
    </AdminPage>
  );
}
