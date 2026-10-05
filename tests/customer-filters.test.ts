import { describe, expect, it } from "vitest";

import {
  countCustomerFilters,
  customerEmailFromParam,
  customerListSearch,
  customerPathSegment,
  customerSegments,
  matchesCustomerFilter,
  matchesCustomerSearch,
  paginateCustomers,
  parseCustomerFilter,
  parseCustomerPage,
  parseCustomerSort,
  sortCustomers,
  type ListedCustomer,
} from "@/lib/customers/filters";
import { LAPSED_AFTER_DAYS, LOYAL_MIN_ORDERS } from "@/lib/discounts/segments";

const NOW = new Date(Date.UTC(2026, 9, 1, 12));
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function customer(overrides: Partial<ListedCustomer> & { email: string }): ListedCustomer {
  return {
    name: null,
    hasAccount: false,
    orders: 1,
    spentCents: 1000,
    lastOrderAt: daysBefore(1),
    ...overrides,
  };
}

// Thresholds come from the segment rules, so these stay right if they move.
const ann = customer({
  email: "ann@example.com",
  name: "Ann Lee",
  hasAccount: true,
  orders: LOYAL_MIN_ORDERS,
  spentCents: 9000,
  lastOrderAt: daysBefore(2),
});
const bo = customer({
  email: "bo@example.com",
  orders: 2,
  spentCents: 9000,
  lastOrderAt: daysBefore(LAPSED_AFTER_DAYS + 1),
});
const cy = customer({ email: "cy_d@example.com", spentCents: 400, lastOrderAt: daysBefore(10) });
const customers = [cy, bo, ann];

const emails = (list: ListedCustomer[]) => list.map((c) => c.email);

describe("matchesCustomerFilter", () => {
  it("counts repeat customers from two paid orders", () => {
    expect(matchesCustomerFilter(bo, "repeat", NOW)).toBe(true);
    expect(matchesCustomerFilter(cy, "repeat", NOW)).toBe(false);
  });

  it("uses the discount segments' own loyal and lapsed rules", () => {
    expect(matchesCustomerFilter(ann, "loyal", NOW)).toBe(true);
    expect(matchesCustomerFilter(bo, "loyal", NOW)).toBe(false);
    expect(matchesCustomerFilter(bo, "lapsed", NOW)).toBe(true);
    // Exactly on the threshold is not lapsed yet — the segment says "more than".
    expect(
      matchesCustomerFilter({ ...bo, lastOrderAt: daysBefore(LAPSED_AFTER_DAYS) }, "lapsed", NOW),
    ).toBe(false);
  });

  it("splits signed-in customers from guests", () => {
    expect(matchesCustomerFilter(ann, "signed-in", NOW)).toBe(true);
    expect(matchesCustomerFilter(ann, "guest", NOW)).toBe(false);
    expect(matchesCustomerFilter(cy, "guest", NOW)).toBe(true);
  });
});

describe("countCustomerFilters", () => {
  it("counts every chip over the whole list", () => {
    expect(countCustomerFilters(customers, NOW)).toEqual({
      all: 3,
      repeat: 2,
      loyal: 1,
      lapsed: 1,
      "signed-in": 1,
      guest: 2,
    });
  });
});

describe("matchesCustomerSearch", () => {
  it("matches the email and the account name, ignoring case", () => {
    expect(matchesCustomerSearch(ann, "ANN@")).toBe(true);
    expect(matchesCustomerSearch(ann, "lee")).toBe(true);
    expect(matchesCustomerSearch(bo, "lee")).toBe(false);
  });

  it("treats an underscore as itself, not a wildcard", () => {
    expect(matchesCustomerSearch(cy, "cy_d")).toBe(true);
    expect(matchesCustomerSearch(ann, "a_n")).toBe(false);
  });

  it("matches everyone on an empty or blank query", () => {
    expect(matchesCustomerSearch(bo, "")).toBe(true);
    expect(matchesCustomerSearch(bo, "   ")).toBe(true);
  });
});

describe("sortCustomers", () => {
  it("orders by spend, newest order breaking a tie", () => {
    expect(emails(sortCustomers(customers, "spend"))).toEqual([
      "ann@example.com",
      "bo@example.com",
      "cy_d@example.com",
    ]);
  });

  it("orders by order count", () => {
    expect(emails(sortCustomers(customers, "orders"))).toEqual([
      "ann@example.com",
      "bo@example.com",
      "cy_d@example.com",
    ]);
  });

  it("orders by most recent order", () => {
    expect(emails(sortCustomers(customers, "recent"))).toEqual([
      "ann@example.com",
      "cy_d@example.com",
      "bo@example.com",
    ]);
  });

  it("falls back to the email so equal rows keep a stable order", () => {
    const twin = { ...cy, email: "aa@example.com" };
    expect(emails(sortCustomers([cy, twin], "recent"))).toEqual([
      "aa@example.com",
      "cy_d@example.com",
    ]);
  });

  it("does not mutate its input", () => {
    const before = emails(customers);
    sortCustomers(customers, "spend");
    expect(emails(customers)).toEqual(before);
  });
});

describe("paginateCustomers", () => {
  const list = Array.from({ length: 7 }, (_, index) => index + 1);

  it("slices a page and reports where it sits", () => {
    expect(paginateCustomers(list, 2, 3)).toEqual({
      items: [4, 5, 6],
      page: 2,
      pageCount: 3,
      total: 7,
      from: 4,
      to: 6,
    });
  });

  it("lands a page past the end on the last page", () => {
    const page = paginateCustomers(list, 99, 3);
    expect(page.page).toBe(3);
    expect(page.items).toEqual([7]);
  });

  it("has one empty page when nothing matches", () => {
    expect(paginateCustomers([], 1, 3)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});

describe("parsing the URL", () => {
  it("accepts known filters and sorts, and falls back otherwise", () => {
    expect(parseCustomerFilter("signed-in")).toBe("signed-in");
    expect(parseCustomerFilter("RETURNING")).toBe("all");
    expect(parseCustomerFilter(undefined)).toBe("all");
    expect(parseCustomerSort("recent")).toBe("recent");
    expect(parseCustomerSort("email")).toBe("spend");
  });

  it("reads only positive whole page numbers", () => {
    expect(parseCustomerPage("3")).toBe(3);
    expect(parseCustomerPage("0")).toBe(1);
    expect(parseCustomerPage("-2")).toBe(1);
    expect(parseCustomerPage("2.5")).toBe(1);
    expect(parseCustomerPage("abc")).toBe(1);
    expect(parseCustomerPage("99999999999999999999")).toBe(1);
  });
});

describe("customerListSearch", () => {
  it("leaves every default out of the URL", () => {
    expect(customerListSearch({ filter: "all", query: "", sort: "spend", page: 1 })).toBe("");
  });

  it("keeps the rest", () => {
    expect(
      customerListSearch({ filter: "lapsed", query: " ann ", sort: "recent", page: 2 }),
    ).toBe("?filter=lapsed&q=ann&sort=recent&page=2");
  });
});

describe("customer URLs", () => {
  it("round-trips an address through the path segment", () => {
    const segment = customerPathSegment(" Ann.Lee+shop@Example.com ");
    expect(segment).toBe("ann.lee%2Bshop%40example.com");
    expect(customerEmailFromParam(segment)).toBe("ann.lee+shop@example.com");
  });

  it("reads the param whether Next decoded it or not", () => {
    // The page gets the encoded form, generateMetadata the decoded one.
    expect(customerEmailFromParam("a%2Btag%40example.com")).toBe("a+tag@example.com");
    expect(customerEmailFromParam("a+tag@example.com")).toBe("a+tag@example.com");
    expect(customerEmailFromParam("Ann%40Example.com")).toBe("ann@example.com");
  });

  it("leaves a malformed sequence alone rather than throwing", () => {
    expect(customerEmailFromParam("ann%E0%A4%A@example.com")).toBe("ann%e0%a4%a@example.com");
  });
});

describe("customerSegments", () => {
  it("lists the segments a customer is in, never first-time", () => {
    expect(customerSegments(ann, NOW)).toEqual(["RETURNING", "LOYAL", "ACCOUNT_HOLDERS"]);
    expect(customerSegments(bo, NOW)).toEqual(["RETURNING", "LAPSED"]);
  });
});
