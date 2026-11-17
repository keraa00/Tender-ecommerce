import { formatDateTime } from "@/lib/dates";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";

/** The Online store page's words for each state, in the seller's language. */
export type ThemeStatusCopy = {
  locale: Locale;
  t: Pick<AdminMessages["onlineStore"], "badge" | "summary">;
};

/**
 * Where a store's design stands, for the Online store page. Pure, so the
 * wording a seller sees for each state is tested rather than eyeballed.
 */

export type ThemeRecord = {
  draftVersion: number;
  publishedVersion: number | null;
  draftSavedAt: Date | null;
  publishedAt: Date | null;
};

export type ThemeStatus =
  /** Never saved: buyers see the default theme. */
  | { kind: "default" }
  /** Saved but never published: buyers still see the default theme. */
  | { kind: "unpublished"; savedAt: Date | null }
  /** Published, and the draft has moved on since. */
  | { kind: "changes"; savedAt: Date | null; publishedAt: Date | null }
  /** What buyers see is the latest draft. */
  | { kind: "published"; publishedAt: Date | null };

export function themeStatus(record: ThemeRecord | null): ThemeStatus {
  if (!record) return { kind: "default" };

  if (record.publishedVersion === null) {
    return { kind: "unpublished", savedAt: record.draftSavedAt };
  }

  if (record.draftVersion > record.publishedVersion) {
    return { kind: "changes", savedAt: record.draftSavedAt, publishedAt: record.publishedAt };
  }

  return { kind: "published", publishedAt: record.publishedAt };
}

/** Whether there is a saved draft buyers are not seeing yet. */
export function hasUnpublishedChanges(status: ThemeStatus): boolean {
  return status.kind === "unpublished" || status.kind === "changes";
}

/**
 * The version a write must start from, read from a form. Versions count up
 * from 0, which means "never saved" — anything else is not one.
 */
export function parseThemeVersion(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

/** The badge beside the theme's name. */
export function themeStatusBadge(
  status: ThemeStatus,
  { t }: ThemeStatusCopy,
): {
  label: string;
  tone: "success" | "warning";
} {
  switch (status.kind) {
    case "default":
    case "published":
      return { label: t.badge.live, tone: "success" };
    case "unpublished":
      return { label: t.badge.notPublished, tone: "warning" };
    case "changes":
      return { label: t.badge.changes, tone: "warning" };
  }
}

/** One sentence on what buyers see and what is waiting. */
export function themeStatusSummary(status: ThemeStatus, { locale, t }: ThemeStatusCopy): string {
  // " 5 Oct 2026, 12:30", or nothing for a row saved before times were kept.
  const at = (date: Date | null) =>
    date ? format(t.summary.at, { date: formatDateTime(date, locale) }) : "";

  switch (status.kind) {
    case "default":
      return t.summary.default;
    case "unpublished":
      return format(t.summary.unpublished, { at: at(status.savedAt) });
    case "changes":
      return format(t.summary.changes, {
        publishedAt: at(status.publishedAt),
        savedAt: at(status.savedAt),
      });
    case "published":
      return format(t.summary.published, { at: at(status.publishedAt) });
  }
}
