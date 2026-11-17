import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  AdminPage,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { getStoreTotals } from "@/lib/analytics/queries";
import { rootDb } from "@/lib/db/root";
import { format, plural } from "@/lib/i18n/format";
import { formatRich } from "@/lib/i18n/rich";
import { getAdminI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { loadZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere, shipsTo } from "@/lib/shipping/rates";
import { getStoreContext } from "@/lib/stores/context";
import { canAcceptOrders, stripeReady } from "@/lib/stores/policy";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: store.name };
}

type Step = {
  title: string;
  body: ReactNode;
  done: boolean;
  /**
   * Whether the feature behind the step exists yet. An unshipped step is not
   * the same as an incomplete one, and collapsing the two is what left the
   * seller hunting for a control that was never rendered.
   */
  shipped: boolean;
  action?: ReactNode;
};

export default async function StoreOverviewPage(
  props: PageProps<"/dashboard/[storeSlug]">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const [productCount, totals, zones, { t: messages, locale, intl }] = await Promise.all([
    rootDb.product.count({ where: { storeId: store.id } }),
    getStoreTotals(store.id),
    loadZoneRules(store.id),
    getAdminI18n(),
  ]);
  const t = messages.home;
  const number = new Intl.NumberFormat(intl);

  const paymentsLive = canAcceptOrders(store);
  const hasProducts = productCount > 0;
  const shipping = shipsAnywhere(zones);
  const coverage = shipsTo(zones);

  const steps: Step[] = [
    {
      title: t.setup.open.title,
      body: formatRich(t.setup.open.body, { path: <bdi dir="ltr">/s/{store.slug}</bdi> }),
      done: true,
      shipped: true,
      action: (
        <ButtonLink
          href={storefrontUrl(store.slug)}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="sm"
        >
          {t.view}
        </ButtonLink>
      ),
    },
    {
      title: t.setup.payments.title,
      body: paymentsLive
        ? stripeReady(store) && store.codEnabled
          ? t.setup.payments.liveBoth
          : stripeReady(store)
            ? t.setup.payments.liveStripe
            : t.setup.payments.liveCod
        : t.setup.payments.notLive,
      done: paymentsLive,
      shipped: true,
      action: (
        <ButtonLink
          href={storeAdminPath(store.slug, "settings/payments")}
          variant={paymentsLive ? "secondary" : "primary"}
          size="sm"
        >
          {paymentsLive ? t.manage : t.setUp}
        </ButtonLink>
      ),
    },
    {
      title: t.setup.products.title,
      body: hasProducts
        ? plural(locale, productCount, t.setup.products.count)
        : t.setup.products.empty,
      done: hasProducts,
      shipped: true,
      action: (
        <ButtonLink
          href={storeAdminPath(
            store.slug,
            hasProducts ? "products" : "products/new",
          )}
          variant={hasProducts ? "secondary" : "primary"}
          size="sm"
        >
          {hasProducts ? t.manage : t.addProduct}
        </ButtonLink>
      ),
    },
    {
      title: t.setup.shipping.title,
      body: shipping
        ? coverage.everywhere
          ? t.setup.shipping.everywhere
          : plural(locale, coverage.countryCodes.length, t.setup.shipping.countries)
        : t.setup.shipping.empty,
      done: shipping,
      shipped: true,
      action: (
        <ButtonLink
          href={storeAdminPath(store.slug, "settings/shipping")}
          variant={shipping ? "secondary" : "primary"}
          size="sm"
        >
          {shipping ? t.manage : t.setUp}
        </ButtonLink>
      ),
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;
  const blocked = steps.some((step) => !step.done && !step.shipped);

  return (
    <AdminPage
      title={t.title}
      description={format(t.description, { store: store.name })}
      action={
        <ButtonLink
          href={storefrontUrl(store.slug)}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="sm"
        >
          {t.viewStorefront}
        </ButtonLink>
      }
    >
      <StatGrid>
        <Stat
          label={t.stats.products}
          value={number.format(productCount)}
          hint={hasProducts ? undefined : t.stats.nothingListed}
        />
        <Stat
          label={t.stats.orders}
          value={number.format(totals.orders)}
          hint={t.stats.paidToDate}
        />
        <Stat
          label={t.stats.revenue}
          value={formatMoney(totals.grossCents, store.currency, intl)}
        />
        <Stat
          label={t.stats.earnings}
          value={formatMoney(totals.netCents, store.currency, intl)}
          hint={t.stats.afterCommission}
        />
      </StatGrid>

      <section className="mt-8">
        <h2 className="text-lg font-medium tracking-tight">{t.setup.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {remaining === 0
            ? t.setup.ready
            : plural(locale, remaining, t.setup.stepsLeft)}
        </p>

        <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {steps.map((step, index) => (
            <ChecklistItem
              key={step.title}
              done={step.done}
              doneLabel={t.setup.completed}
              notDoneLabel={t.setup.notStarted}
              position={number.format(index + 1)}
              title={step.title}
              action={
                step.action ??
                (step.done || step.shipped ? null : <Badge>{t.setup.comingSoon}</Badge>)
              }
            >
              {step.body}
            </ChecklistItem>
          ))}
        </ol>

        {blocked ? (
          <p className="mt-3 text-sm text-muted text-pretty">
            {formatRich(t.setup.comingSoonNote, {
              label: <span className="font-medium">{t.setup.comingSoon}</span>,
            })}
          </p>
        ) : null}
      </section>

      <div className="mt-8 rounded-xl border border-border bg-surface-subtle p-5">
        <h3 className="text-sm font-medium">{t.commission.title}</h3>
        <p className="mt-1 text-sm text-muted text-pretty">
          {formatRich(t.commission.body, {
            rate: (
              <span className="tabular font-medium text-foreground">
                {new Intl.NumberFormat(intl, {
                  style: "percent",
                  minimumFractionDigits: 2,
                }).format(store.commissionBps / 10000)}
              </span>
            ),
          })}
        </p>
      </div>
    </AdminPage>
  );
}

function ChecklistItem({
  done,
  doneLabel,
  notDoneLabel,
  position,
  title,
  action,
  children,
}: {
  done: boolean;
  doneLabel: string;
  notDoneLabel: string;
  position: string;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 bg-surface px-4 py-4">
      {/*
        A numbered token rather than an empty ring: a bare circle next to a
        label reads as a radio button, and sellers try to click it to tick the
        step off. Completion here is derived from the store's actual state, so
        there is nothing to select.
      */}
      <span
        aria-hidden
        className={
          done
            ? "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-[11px] font-bold text-white"
            : "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-subtle text-[11px] font-medium text-muted ring-1 ring-border-strong ring-inset"
        }
      >
        {done ? "✓" : position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted text-pretty">{children}</p>
      </div>

      {action ? <div className="shrink-0 self-center">{action}</div> : null}

      <span className="sr-only">{done ? doneLabel : notDoneLabel}</span>
    </li>
  );
}
