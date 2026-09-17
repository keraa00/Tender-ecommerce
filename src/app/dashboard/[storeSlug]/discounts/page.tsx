import type { Metadata } from "next";

import {
  AdminPage,
  EmptyState,
  Row,
  Rows,
} from "@/components/admin/page-shell";
import { DiscountStateBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { discountState, formatDiscountValue } from "@/lib/discounts/format";
import { listStoreDiscounts } from "@/lib/discounts/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/discounts">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Discounts · ${store.name}` };
}

export default async function DiscountsPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const discounts = await listStoreDiscounts(store.id);
  // One clock for the whole page, so two rows cannot disagree about "now".
  const now = new Date();

  return (
    <AdminPage
      title="Discounts"
      description={
        discounts.length === 0
          ? "Codes buyers can enter at checkout, and automatic offers that apply on their own."
          : `${discounts.length} ${discounts.length === 1 ? "discount" : "discounts"} on this store.`
      }
    >
      {discounts.length === 0 ? (
        <EmptyState title="No discounts yet">
          A discount with a code is entered at checkout; one without a code
          applies automatically whenever its conditions hold. Creating them from
          here is not in this build yet — the seeded stores ship with examples.
        </EmptyState>
      ) : (
        <Rows>
          {discounts.map((discount) => {
            const state = discountState(discount, now);
            const window = describeWindow(discount.startsAt, discount.endsAt);

            return (
              <Row key={discount.id}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
                    <span className="truncate">{discount.title}</span>
                    {discount.code ? (
                      <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs font-medium text-muted ring-1 ring-border ring-inset">
                        {discount.code}
                      </code>
                    ) : (
                      <span className="text-xs text-muted">Automatic</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted tabular">
                    {formatDiscountValue(discount)}
                    {window ? ` · ${window}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-right text-sm text-muted tabular">
                  {discount.usageCount}
                  {discount.usageLimit === null
                    ? " used"
                    : ` / ${discount.usageLimit} used`}
                </div>

                <div className="shrink-0">
                  <DiscountStateBadge state={state} />
                </div>
              </Row>
            );
          })}
        </Rows>
      )}
    </AdminPage>
  );
}

/** "From 1 Jun 2026", "Until 30 Jun 2026", or both. Null when open-ended. */
function describeWindow(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt) {
    return `${formatDate(startsAt)} – ${formatDate(endsAt)}`;
  }
  if (startsAt) return `From ${formatDate(startsAt)}`;
  if (endsAt) return `Until ${formatDate(endsAt)}`;
  return null;
}
