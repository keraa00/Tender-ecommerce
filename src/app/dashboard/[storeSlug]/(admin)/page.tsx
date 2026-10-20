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
import { formatMoney } from "@/lib/money";
import { loadZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere, shipsTo } from "@/lib/shipping/rates";
import { getStoreContext } from "@/lib/stores/context";
import { canAcceptOrders } from "@/lib/stores/policy";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: store.name };
}

type Step = {
  title: string;
  body: string;
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

  const [productCount, totals, zones] = await Promise.all([
    rootDb.product.count({ where: { storeId: store.id } }),
    getStoreTotals(store.id),
    loadZoneRules(store.id),
  ]);

  const paymentsLive = canAcceptOrders(store);
  const hasProducts = productCount > 0;
  const shipping = shipsAnywhere(zones);
  const coverage = shipsTo(zones);

  const steps: Step[] = [
    {
      title: "Open your store",
      body: `Live at /s/${store.slug}.`,
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
          View
        </ButtonLink>
      ),
    },
    {
      title: "Connect Stripe",
      body: paymentsLive
        ? "Payments are live. Buyers can check out."
        : "Buyers can browse your store, but the buy button stays disabled until Stripe onboarding is finished.",
      done: paymentsLive,
      shipped: true,
      action: (
        <ButtonLink
          href={storeAdminPath(store.slug, "settings/payments")}
          variant={paymentsLive ? "secondary" : "primary"}
          size="sm"
        >
          {paymentsLive ? "Manage" : "Set up"}
        </ButtonLink>
      ),
    },
    {
      title: "Add your first product",
      body: hasProducts
        ? `${productCount} ${productCount === 1 ? "product" : "products"} in your catalogue.`
        : "Nothing to sell yet. Add a product with a photo, a price and some stock.",
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
          {hasProducts ? "Manage" : "Add product"}
        </ButtonLink>
      ),
    },
    {
      title: "Set up shipping",
      body: shipping
        ? coverage.everywhere
          ? "You ship to every country."
          : `You ship to ${coverage.countryCodes.length} ${coverage.countryCodes.length === 1 ? "country" : "countries"}.`
        : "Add a shipping zone with at least one rate. Until then, buyers can only check out digital products and services.",
      done: shipping,
      shipped: true,
      action: (
        <ButtonLink
          href={storeAdminPath(store.slug, "settings/shipping")}
          variant={shipping ? "secondary" : "primary"}
          size="sm"
        >
          {shipping ? "Manage" : "Set up"}
        </ButtonLink>
      ),
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;
  const blocked = steps.some((step) => !step.done && !step.shipped);

  return (
    <AdminPage
      title="Home"
      description={`An overview of ${store.name}.`}
      action={
        <ButtonLink
          href={storefrontUrl(store.slug)}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="sm"
        >
          View storefront
        </ButtonLink>
      }
    >
      <StatGrid>
        <Stat
          label="Products"
          value={String(productCount)}
          hint={hasProducts ? undefined : "Nothing listed yet"}
        />
        <Stat label="Orders" value={String(totals.orders)} hint="Paid to date" />
        <Stat label="Revenue" value={formatMoney(totals.grossCents, store.currency)} />
        <Stat
          label="Your earnings"
          value={formatMoney(totals.netCents, store.currency)}
          hint="After commission"
        />
      </StatGrid>

      <section className="mt-8">
        <h2 className="text-lg font-medium tracking-tight">Set up your store</h2>
        <p className="mt-1 text-sm text-muted">
          {remaining === 0
            ? "Everything's ready. Your store is open for business."
            : `${remaining} ${remaining === 1 ? "step" : "steps"} left before you can take orders.`}
        </p>

        <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {steps.map((step, index) => (
            <ChecklistItem
              key={step.title}
              done={step.done}
              position={index + 1}
              title={step.title}
              action={
                step.action ??
                (step.done || step.shipped ? null : <Badge>Coming soon</Badge>)
              }
            >
              {step.body}
            </ChecklistItem>
          ))}
        </ol>

        {blocked ? (
          <p className="mt-3 text-sm text-muted text-pretty">
            Steps marked <span className="font-medium">Coming soon</span> are not
            in this build yet. There is nothing to action on them for now.
          </p>
        ) : null}
      </section>

      <div className="mt-8 rounded-xl border border-border bg-surface-subtle p-5">
        <h3 className="text-sm font-medium">Commission</h3>
        <p className="mt-1 text-sm text-muted text-pretty">
          Tender takes{" "}
          <span className="tabular font-medium text-foreground">
            {(store.commissionBps / 100).toFixed(2)}%
          </span>{" "}
          of each order total after discounts. The rest is settled directly to
          your own Stripe account.
        </p>
      </div>
    </AdminPage>
  );
}

function ChecklistItem({
  done,
  position,
  title,
  action,
  children,
}: {
  done: boolean;
  position: number;
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

      <span className="sr-only">{done ? "Completed" : "Not started"}</span>
    </li>
  );
}
