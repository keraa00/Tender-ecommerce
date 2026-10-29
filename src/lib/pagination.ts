/**
 * Page maths for admin lists. Customers pages a list it already holds
 * (`paginateCustomers`); Orders pages in the database, so it needs the
 * `skip` and `take` to ask for, worked out from a total counted first.
 */

/** A 1-based page number. Anything that is not a positive whole number is 1. */
export function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export type PageWindow = {
  /** The page actually shown — a number past the end lands on the last page. */
  page: number;
  pageCount: number;
  total: number;
  skip: number;
  take: number;
  /** 1-based positions of the first and last item shown, for "51–100 of 173". */
  from: number;
  to: number;
};

export function pageWindow(total: number, page: number, pageSize: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const skip = (current - 1) * pageSize;
  const shown = Math.max(0, Math.min(pageSize, total - skip));

  return {
    page: current,
    pageCount,
    total,
    skip,
    take: pageSize,
    from: shown === 0 ? 0 : skip + 1,
    to: skip + shown,
  };
}
