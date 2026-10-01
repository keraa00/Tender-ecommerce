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

/**
 * A date as an `<input type="datetime-local">` value, in UTC: "2026-09-26T14:30".
 *
 * Schedules in the admin are read and written in UTC, the zone every admin
 * date is printed in, so the time a seller types is the time the list shows.
 * Converting to the browser's zone would need the browser's clock during the
 * server render, which is the hydration mismatch the note above is about.
 */
export function toDateTimeInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * Reads a `datetime-local` value as UTC. Null for anything malformed — and for
 * dates that do not exist, like 31 February, which `Date.UTC` would otherwise
 * roll forward into March without a word.
 */
export function parseDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => Number(part ?? "0"));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

/** `n` days before `from`, for the analytics window. */
export function daysAgo(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
