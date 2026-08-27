import type { Metadata } from "next";
import type { ReactNode } from "react";

import { rootDb } from "@/lib/db/root";
import { getStoreContext } from "@/lib/stores/context";
import { canAcceptOrders } from "@/lib/stores/policy";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: store.name };
}

export default async function StoreOverviewPage(
  props: PageProps<"/dashboard/[storeSlug]">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const productCount = await rootDb.product.count({
    where: { storeId: store.id },
  });

  const steps = [
    {
      title: "Open your store",
      body: `Live at /s/${store.slug}.`,
      done: true,
      action: null,
    },
    {
      title: "Connect Stripe",
      body: canAcceptOrders(store)
        ? "Payments are live. Buyers can check out."
        : "Buyers can browse your store, but the buy button stays disabled until Stripe onboarding is finished.",
      done: canAcceptOrders(store),
      action: null,
    },
    {
      title: "Add your first product",
      body:
        productCount > 0
          ? `${productCount} ${productCount === 1 ? "product" : "products"} in your catalogue.`
          : "Nothing to sell yet. Add a product with a photo, a price and some stock.",
      done: productCount > 0,
      action: null,
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;

  return (
    <div className="py-8">
      <h2 className="text-lg font-medium tracking-tight">Set up your store</h2>
      <p className="mt-1 text-sm text-muted">
        {remaining === 0
          ? "Everything's ready. Your store is open for business."
          : `${remaining} ${remaining === 1 ? "step" : "steps"} left before you can take orders.`}
      </p>

      <ol className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {steps.map((step) => (
          <ChecklistItem
            key={step.title}
            done={step.done}
            title={step.title}
            action={step.action}
          >
            {step.body}
          </ChecklistItem>
        ))}
      </ol>

      <div className="mt-8 rounded-xl border border-border bg-surface-subtle p-5">
        <h3 className="text-sm font-medium">Commission</h3>
        <p className="mt-1 text-sm text-muted text-pretty">
          Kiosk takes{" "}
          <span className="tabular font-medium text-foreground">
            {(store.commissionBps / 100).toFixed(2)}%
          </span>{" "}
          of each order total after discounts. The rest is settled directly to
          your own Stripe account.
        </p>
      </div>
    </div>
  );
}

function ChecklistItem({
  done,
  title,
  action,
  children,
}: {
  done: boolean;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 bg-surface px-4 py-4">
      <span
        aria-hidden
        className={
          done
            ? "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-[11px] font-bold text-white"
            : "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-border-strong"
        }
      >
        {done ? "✓" : null}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted text-pretty">{children}</p>
      </div>

      {action}

      <span className="sr-only">{done ? "Completed" : "Not started"}</span>
    </li>
  );
}
