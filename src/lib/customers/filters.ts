import type { CustomerSegment } from "@/lib/db/types";
import {
  CUSTOMER_SEGMENTS,
  matchesAnySegment,
  type CustomerProfile,
} from "@/lib/discounts/segments";
import { parsePage } from "@/lib/pagination";

/**
 * The customer list's filters, search, sort and paging, as pure functions over
 * customers already rolled up from their orders. The page reads every one of
 * them from the URL, so a filtered view is a link a seller can share or reload.
 *
 * "Loyal", "Lapsed" and "Signed in" are the discount segments themselves, not
 * look-alikes: a customer shown under "Lapsed" here is exactly one a
 * lapsed-customer discount would reach.
 */

/** The fields a list row is filtered and sorted on. */
export type ListedCustomer = {
  /** Lower-cased. */
  email: string;
  name: string | null;
  hasAccount: boolean;
  /** Settled orders. */
  orders: number;
  spentCents: number;
  lastOrderAt: Date;
};

/**
 * First-time and returning are deliberately not here. They describe a buyer at
 * checkout, and everyone on this list has paid at least once — so "returning"
 * would always be everyone and "first-time" always no one.
 */
export const CUSTOMER_FILTERS = [
  "all",
  "repeat",
  "loyal",
  "lapsed",
  "signed-in",
  "guest",
] as const;

export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

/** Not a discount segment — the plain "came back at least once" count. */
export const REPEAT_MIN_ORDERS = 2;

export const CUSTOMER_SORTS = ["spend", "orders", "recent"] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMERS_PAGE_SIZE = 25;

export function parseCustomerFilter(value: unknown): CustomerFilter {
  return typeof value === "string" &&
    (CUSTOMER_FILTERS as readonly string[]).includes(value)
    ? (value as CustomerFilter)
    : "all";
}

export function parseCustomerSort(value: unknown): CustomerSort {
  return typeof value === "string" &&
    (CUSTOMER_SORTS as readonly string[]).includes(value)
    ? (value as CustomerSort)
    : "spend";
}

/** A 1-based page number. Anything that is not a positive whole number is 1. */
export const parseCustomerPage = parsePage;

/** The same shape checkout judges segment discounts against. */
export function customerProfile(customer: ListedCustomer): CustomerProfile {
  return {
    email: customer.email,
    hasAccount: customer.hasAccount,
    settledOrders: customer.orders,
    lastOrderAt: customer.lastOrderAt,
  };
}

const FILTER_SEGMENT: Partial<Record<CustomerFilter, CustomerSegment>> = {
  loyal: "LOYAL",
  lapsed: "LAPSED",
  "signed-in": "ACCOUNT_HOLDERS",
};

export function matchesCustomerFilter(
  customer: ListedCustomer,
  filter: CustomerFilter,
  now: Date,
): boolean {
  const segment = FILTER_SEGMENT[filter];
  if (segment) return matchesAnySegment([segment], customerProfile(customer), now);

  switch (filter) {
    case "repeat":
      return customer.orders >= REPEAT_MIN_ORDERS;
    case "guest":
      return !customer.hasAccount;
    default:
      return true;
  }
}

/** How many customers each chip would show, over the whole list. */
export function countCustomerFilters(
  customers: readonly ListedCustomer[],
  now: Date,
): Record<CustomerFilter, number> {
  const counts = Object.fromEntries(
    CUSTOMER_FILTERS.map((filter) => [filter, 0]),
  ) as Record<CustomerFilter, number>;

  for (const customer of customers) {
    for (const filter of CUSTOMER_FILTERS) {
      if (matchesCustomerFilter(customer, filter, now)) counts[filter] += 1;
    }
  }
  return counts;
}

/** Case-insensitive, on the email and on the account's name. */
export function matchesCustomerSearch(
  customer: ListedCustomer,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    customer.email.toLowerCase().includes(needle) ||
    (customer.name ?? "").toLowerCase().includes(needle)
  );
}

// Every ordering ends on the email, which is unique, so a customer cannot move
// between pages from one request to the next while the data stays the same.
const byEmail = (a: ListedCustomer, b: ListedCustomer) =>
  a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
const byRecent = (a: ListedCustomer, b: ListedCustomer) =>
  b.lastOrderAt.getTime() - a.lastOrderAt.getTime();

/** Returns a new array; the input is left alone. */
export function sortCustomers<T extends ListedCustomer>(
  customers: readonly T[],
  sort: CustomerSort,
): T[] {
  const copy = [...customers];

  switch (sort) {
    case "spend":
      return copy.sort(
        (a, b) => b.spentCents - a.spentCents || byRecent(a, b) || byEmail(a, b),
      );
    case "orders":
      return copy.sort(
        (a, b) => b.orders - a.orders || b.spentCents - a.spentCents || byEmail(a, b),
      );
    case "recent":
      return copy.sort((a, b) => byRecent(a, b) || byEmail(a, b));
  }
}

export type CustomerPage<T> = {
  items: T[];
  /** The page actually shown — a number past the end lands on the last page. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last item shown, for "26–50 of 73". */
  from: number;
  to: number;
};

export function paginateCustomers<T>(
  customers: readonly T[],
  page: number,
  pageSize: number = CUSTOMERS_PAGE_SIZE,
): CustomerPage<T> {
  const total = customers.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const items = customers.slice(start, start + pageSize);

  return {
    items,
    page: current,
    pageCount,
    total,
    from: items.length === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}

export type CustomerListState = {
  filter: CustomerFilter;
  query: string;
  sort: CustomerSort;
  page: number;
};

/** The query string for a list view, leaving out every default. */
export function customerListSearch(state: CustomerListState): string {
  const params = new URLSearchParams();
  if (state.filter !== "all") params.set("filter", state.filter);
  const query = state.query.trim();
  if (query) params.set("q", query);
  if (state.sort !== "spend") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/**
 * The detail page's path segment for an email. Lower-cased so one buyer has
 * one URL however they typed their address, and encoded because `+` and `@`
 * are common in addresses and `%`-sequences are not.
 */
export function customerPathSegment(email: string): string {
  return encodeURIComponent(email.trim().toLowerCase());
}

/**
 * The email back out of the route param. Next 16 is not consistent here: the
 * page is handed the segment still percent-encoded while `generateMetadata`
 * gets it decoded, so this decodes whichever arrives. That is safe to do twice
 * because checkout never accepts an address with `%` in it. A malformed
 * sequence comes back as written, and matches no customer.
 */
export function customerEmailFromParam(param: string): string {
  let email = param;
  try {
    email = decodeURIComponent(param);
  } catch {
    // Left as written; the lookup will find no one and the page 404s.
  }
  return email.trim().toLowerCase();
}

/** The segments a customer is in, in the order the discount form lists them. */
export function customerSegments(
  customer: ListedCustomer,
  now: Date,
): CustomerSegment[] {
  const profile = customerProfile(customer);
  return CUSTOMER_SEGMENTS.filter((segment) =>
    matchesAnySegment([segment], profile, now),
  );
}
