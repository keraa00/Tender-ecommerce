import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  AdminPage,
  EmptyState,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { cn } from "@/lib/cn";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_FILTER_LABELS,
  CUSTOMER_SORTS,
  CUSTOMER_SORT_LABELS,
  REPEAT_MIN_ORDERS,
  countCustomerFilters,
  customerListSearch,
  customerPathSegment,
  matchesCustomerFilter,
  matchesCustomerSearch,
  paginateCustomers,
  parseCustomerFilter,
  parseCustomerPage,
  parseCustomerSort,
  sortCustomers,
  type CustomerListState,
} from "@/lib/customers/filters";
import { listAllStoreCustomers } from "@/lib/customers/queries";
import { formatDate } from "@/lib/dates";
import { LAPSED_AFTER_DAYS } from "@/lib/discounts/segments";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Customers · ${store.name}` };
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const SORT_DESCRIPTIONS = {
  spend: "highest spend first",
  orders: "most orders first",
  recent: "most recent order first",
} as const;

export default async function CustomersPage(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
) {
  const { storeSlug } = await props.params;
  const searchParams = await props.searchParams;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const { store } = await getStoreContext(storeSlug);

  const customers = await listAllStoreCustomers(store.id);
  // One clock for the whole page, so a chip's count and the rows under it
  // cannot disagree about who has lapsed.
  const now = new Date();

  const state: CustomerListState = {
    filter: parseCustomerFilter(firstParam(searchParams.filter)),
    query: firstParam(searchParams.q).trim(),
    sort: parseCustomerSort(firstParam(searchParams.sort)),
    page: parseCustomerPage(firstParam(searchParams.page)),
  };

  // Counted, filtered and sorted in memory: a store has hundreds of customers,
  // not millions, and segments like "lapsed" are rules rather than columns.
  const counts = countCustomerFilters(customers, now);
  const matching = sortCustomers(
    customers.filter(
      (customer) =>
        matchesCustomerFilter(customer, state.filter, now) &&
        matchesCustomerSearch(customer, state.query),
    ),
    state.sort,
  );
  const page = paginateCustomers(matching, state.page);

  const basePath = storeAdminPath(store.slug, "customers");
  const listHref = (changes: Partial<CustomerListState>) =>
    `${basePath}${customerListSearch({ ...state, page: 1, ...changes })}`;

  return (
    <AdminPage
      title="Customers"
      description={
        customers.length === 0
          ? "Everyone who has bought from this store, with what they have spent."
          : `${customers.length} ${customers.length === 1 ? "customer" : "customers"}, ${SORT_DESCRIPTIONS[state.sort]}.`
      }
    >
      {customers.length === 0 ? (
        <EmptyState title="No customers yet">
          A customer appears here after their first paid order. Guests count too
          — they are grouped by the email they checked out with.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label="Customers" value={String(counts.all)} />
            <Stat
              label="Repeat customers"
              value={String(counts.repeat)}
              hint={`${REPEAT_MIN_ORDERS} or more paid orders`}
            />
            <Stat
              label="Guests"
              value={String(counts.guest)}
              hint="No account with that email"
            />
            <Stat
              label="Lapsed"
              value={String(counts.lapsed)}
              hint={`No order in ${LAPSED_AFTER_DAYS} days`}
            />
          </StatGrid>

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <nav aria-label="Filter customers" className="-mx-1 flex flex-wrap gap-1">
                {CUSTOMER_FILTERS.map((key) => (
                  <Link
                    key={key}
                    href={listHref({ filter: key })}
                    aria-current={state.filter === key ? "page" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1 text-sm transition-colors",
                      state.filter === key
                        ? "bg-foreground text-background"
                        : "text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    {CUSTOMER_FILTER_LABELS[key]}{" "}
                    <span className="tabular opacity-70">{counts[key]}</span>
                  </Link>
                ))}
              </nav>

              <form action={basePath} className="flex gap-2 sm:w-64" role="search">
                {state.filter !== "all" ? (
                  <input type="hidden" name="filter" value={state.filter} />
                ) : null}
                {state.sort !== "spend" ? (
                  <input type="hidden" name="sort" value={state.sort} />
                ) : null}
                <Input
                  type="search"
                  name="q"
                  defaultValue={state.query}
                  placeholder="Search name or email"
                  aria-label="Search customers by name or email"
                  className="h-8"
                />
              </form>
            </div>

            <nav
              aria-label="Sort customers"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              <span className="text-muted">Sort by</span>
              {CUSTOMER_SORTS.map((key) => (
                <Link
                  key={key}
                  href={listHref({ sort: key })}
                  aria-current={state.sort === key ? "page" : undefined}
                  className={cn(
                    "underline-offset-4 transition-colors",
                    state.sort === key
                      ? "font-medium text-foreground underline"
                      : "text-muted hover:text-foreground hover:underline",
                  )}
                >
                  {CUSTOMER_SORT_LABELS[key]}
                </Link>
              ))}
            </nav>
          </div>

          {page.total === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              No customers match.{" "}
              <Link href={basePath} className="underline underline-offset-4">
                Show all
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              <Rows>
                {page.items.map((customer) => (
                  <li key={customer.email}>
                    <Link
                      href={storeAdminPath(
                        store.slug,
                        `customers/${customerPathSegment(customer.email)}`,
                      )}
                      className="flex items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                    >
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-subtle text-sm font-medium text-muted ring-1 ring-border ring-inset"
                      >
                        {(customer.name ?? customer.email).charAt(0).toUpperCase()}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate font-medium">
                          <span className="truncate">
                            {customer.name ?? customer.email}
                          </span>
                          {customer.hasAccount ? null : <Badge>Guest</Badge>}
                        </p>
                        <p className="truncate text-sm text-muted tabular">
                          {customer.name ? `${customer.email} · ` : ""}
                          {customer.orders}{" "}
                          {customer.orders === 1 ? "order" : "orders"} · last{" "}
                          {formatDate(customer.lastOrderAt)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right font-medium tabular">
                        {formatMoney(customer.spentCents)}
                      </div>
                    </Link>
                  </li>
                ))}
              </Rows>

              {page.pageCount > 1 ? (
                <nav
                  aria-label="Pages"
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <p className="text-muted tabular">
                    {page.from}–{page.to} of {page.total}
                  </p>
                  <div className="flex gap-2">
                    <PageLink
                      href={page.page > 1 ? listHref({ page: page.page - 1 }) : null}
                      rel="prev"
                    >
                      ← Previous
                    </PageLink>
                    <PageLink
                      href={
                        page.page < page.pageCount
                          ? listHref({ page: page.page + 1 })
                          : null
                      }
                      rel="next"
                    >
                      Next →
                    </PageLink>
                  </div>
                </nav>
              ) : null}
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}

/** A pager button that is plain text, not a dead link, at either end. */
function PageLink({
  href,
  rel,
  children,
}: {
  href: string | null;
  rel: "prev" | "next";
  children: ReactNode;
}) {
  return href ? (
    <ButtonLink href={href} rel={rel} variant="secondary" size="sm">
      {children}
    </ButtonLink>
  ) : (
    <span
      aria-disabled
      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted opacity-60"
    >
      {children}
    </span>
  );
}
