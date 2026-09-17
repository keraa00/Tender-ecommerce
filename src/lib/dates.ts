/**
 * Dates are formatted only at the edge, like money. Fixed locale and an
 * explicit UTC timezone so a server render and a later client render of the
 * same row cannot disagree — a hydration mismatch on a date column is the kind
 * of bug that only shows up for users west of the server.
 */

const DEFAULT_LOCALE = "en-GB";

const dayFormat = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dayTimeFormat = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDate(date: Date): string {
  return dayFormat.format(date);
}

export function formatDateTime(date: Date): string {
  return dayTimeFormat.format(date);
}

/** `n` days before `from`, for the analytics window. */
export function daysAgo(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
