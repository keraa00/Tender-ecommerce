import type { Metadata } from "next";
import Link from "next/link";

import {
  AdminPage,
  EmptyState,
  Pager,
  Rows,
  Stat,
  StatGrid,
} from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { storeAdminPath } from "@/lib/admin/links";
import { cn } from "@/lib/cn";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTS,
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
import { format, plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.customers.title} · ${store.name}` };
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function CustomersPage(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
) {
  const { storeSlug } = await props.params;
  const searchParams = await props.searchParams;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const [{ store }, { t: messages, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.customers;
  const number = new Intl.NumberFormat(intl);

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
      title={t.title}
      description={
        customers.length === 0
          ? t.empty
          : plural(locale, customers.length, t.count, { sort: t.sortDescriptions[state.sort] })
      }
    >
      {customers.length === 0 ? (
        <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>
      ) : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label={t.stats.customers} value={number.format(counts.all)} />
            <Stat
              label={t.stats.repeat}
              value={number.format(counts.repeat)}
              hint={format(t.stats.repeatHint, { count: number.format(REPEAT_MIN_ORDERS) })}
            />
            <Stat
              label={t.stats.guests}
              value={number.format(counts.guest)}
              hint={t.stats.guestsHint}
            />
            <Stat
              label={t.stats.lapsed}
              value={number.format(counts.lapsed)}
              hint={format(t.stats.lapsedHint, { days: number.format(LAPSED_AFTER_DAYS) })}
            />
          </StatGrid>

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <nav aria-label={t.filterLabel} className="-mx-1 flex flex-wrap gap-1">
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
                    {t.filters[key]}{" "}
                    <span className="tabular opacity-70">{number.format(counts[key])}</span>
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
                  placeholder={t.searchPlaceholder}
                  aria-label={t.searchLabel}
                  className="h-8"
                />
              </form>
            </div>

            <nav
              aria-label={t.sortLabel}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              <span className="text-muted">{t.sortBy}</span>
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
                  {t.sorts[key]}
                </Link>
              ))}
            </nav>
          </div>

          {page.total === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              {t.noMatch}{" "}
              <Link href={basePath} className="underline underline-offset-4">
                {t.showAll}
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
                          {customer.hasAccount ? null : <Badge>{t.guest}</Badge>}
                        </p>
                        <p className="truncate text-sm text-muted tabular">
                          {customer.name ? `${customer.email} · ` : ""}
                          {plural(locale, customer.orders, t.orderSummary, {
                            date: formatDate(customer.lastOrderAt, locale),
                          })}
                        </p>
                      </div>

                      <div className="shrink-0 text-end font-medium tabular">
                        {formatMoney(customer.spentCents, store.currency, intl)}
                      </div>
                    </Link>
                  </li>
                ))}
              </Rows>

              {page.pageCount > 1 ? (
                <Pager
                  from={page.from}
                  to={page.to}
                  total={page.total}
                  prevHref={page.page > 1 ? listHref({ page: page.page - 1 }) : null}
                  nextHref={page.page < page.pageCount ? listHref({ page: page.page + 1 }) : null}
                />
              ) : null}
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}

/** A pager button that is plain text, not a dead link, at either end. */
