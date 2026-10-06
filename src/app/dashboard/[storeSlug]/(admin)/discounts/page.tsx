import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { DiscountStateBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { cn } from "@/lib/cn";
import { setDiscountActiveAction } from "@/lib/discounts/actions";
import {
  DISCOUNT_STATE_LABELS,
  describeDiscount,
  describeWindow,
  discountState,
  formatDiscountValue,
  type DiscountState,
} from "@/lib/discounts/format";
import { listStoreDiscounts, toDiscountSummary } from "@/lib/discounts/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/discounts">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Discounts · ${store.name}` };
}

const FILTERS: readonly ("all" | DiscountState)[] = [
  "all",
  "active",
  "scheduled",
  "expired",
  "exhausted",
  "disabled",
];

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DiscountsPage(
  props: PageProps<"/dashboard/[storeSlug]/discounts">,
) {
  const { storeSlug } = await props.params;
  const searchParams = await props.searchParams;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const { store } = await getStoreContext(storeSlug);

  const discounts = await listStoreDiscounts(store.id);
  // One clock for the whole page, so two rows cannot disagree about "now".
  const now = new Date();

  const rows = discounts.map((discount) => ({
    discount,
    state: discountState(discount, now),
  }));

  const counts = new Map<string, number>([["all", rows.length]]);
  for (const { state } of rows) counts.set(state, (counts.get(state) ?? 0) + 1);

  const rawFilter = firstParam(searchParams.status);
  const filter = FILTERS.includes(rawFilter as DiscountState) ? rawFilter : "all";
  const query = firstParam(searchParams.q).trim();
  const needle = query.toLowerCase();

  // A store has tens of discounts, not thousands, so filtering the one list in
  // memory beats a second query shape — and "state" is derived, not a column.
  const visible = rows.filter(
    ({ discount, state }) =>
      (filter === "all" || state === filter) &&
      (needle === "" ||
        discount.title.toLowerCase().includes(needle) ||
        (discount.code ?? "").toLowerCase().includes(needle)),
  );

  const basePath = storeAdminPath(store.slug, "discounts");
  const newHref = storeAdminPath(store.slug, "discounts/new");

  function filterHref(next: string) {
    const params = new URLSearchParams();
    if (next !== "all") params.set("status", next);
    if (query) params.set("q", query);
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return (
    <AdminPage
      title="Discounts"
      description={
        discounts.length === 0
          ? "Codes buyers enter at checkout, and automatic offers that apply on their own."
          : `${discounts.length} ${discounts.length === 1 ? "discount" : "discounts"} on this store.`
      }
      action={
        discounts.length > 0 ? (
          <ButtonLink href={newHref} size="sm">
            Create discount
          </ButtonLink>
        ) : null
      }
    >
      {discounts.length === 0 ? (
        <EmptyState
          title="No discounts yet"
          action={
            <ButtonLink href={newHref} size="lg">
              Create a discount
            </ButtonLink>
          }
        >
          Percentages, fixed amounts, buy-X-get-Y and free shipping — as a code
          buyers enter, or applied automatically when an order qualifies.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-1">
              {FILTERS.filter((key) => key === "all" || counts.has(key)).map((key) => (
                <Link
                  key={key}
                  href={filterHref(key)}
                  aria-current={filter === key ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors",
                    filter === key
                      ? "bg-foreground text-background"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  {key === "all" ? "All" : DISCOUNT_STATE_LABELS[key]}{" "}
                  <span className="tabular opacity-70">{counts.get(key) ?? 0}</span>
                </Link>
              ))}
            </nav>

            <form action={basePath} className="flex gap-2 sm:w-64" role="search">
              {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
              <Input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search title or code"
                aria-label="Search discounts by title or code"
                className="h-8"
              />
            </form>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              No discounts match.{" "}
              <Link href={basePath} className="underline underline-offset-4">
                Show all
              </Link>
            </p>
          ) : (
            <Rows>
              {visible.map(({ discount, state }) => {
                const summary = toDiscountSummary(discount);
                const window = describeWindow(discount.startsAt, discount.endsAt);
                const toggle = setDiscountActiveAction.bind(null, storeSlug, discount.id);

                return (
                  <li
                    key={discount.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-nowrap"
                  >
                    <Link
                      href={storeAdminPath(store.slug, `discounts/${discount.id}`)}
                      className="min-w-0 flex-1 basis-full sm:basis-auto"
                    >
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
                        {discount.type === "PERCENTAGE" || discount.type === "FIXED_AMOUNT"
                          ? describeDiscount(summary)[0]
                          : formatDiscountValue(discount)}
                        {window ? ` · ${window}` : ""}
                      </p>
                    </Link>

                    <div className="shrink-0 text-right text-sm text-muted tabular">
                      {discount.usageCount}
                      {discount.usageLimit === null
                        ? " used"
                        : ` / ${discount.usageLimit} used`}
                    </div>

                    <div className="w-24 shrink-0 text-right">
                      <DiscountStateBadge state={state} />
                    </div>

                    <form action={toggle} className="shrink-0">
                      <input type="hidden" name="active" value={String(!discount.active)} />
                      <Button type="submit" variant="ghost" size="sm" className="w-20">
                        {discount.active ? "Turn off" : "Turn on"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </Rows>
          )}
        </div>
      )}
    </AdminPage>
  );
}
