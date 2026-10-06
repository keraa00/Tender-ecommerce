import { formatDateTime } from "@/lib/dates";

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
export function themeStatusBadge(status: ThemeStatus): {
  label: string;
  tone: "success" | "warning";
} {
  switch (status.kind) {
    case "default":
    case "published":
      return { label: "Live", tone: "success" };
    case "unpublished":
      return { label: "Not published", tone: "warning" };
    case "changes":
      return { label: "Unpublished changes", tone: "warning" };
  }
}

/** One sentence on what buyers see and what is waiting. */
export function themeStatusSummary(status: ThemeStatus): string {
  const at = (date: Date | null) => (date ? ` ${formatDateTime(date)}` : "");

  switch (status.kind) {
    case "default":
      return "Buyers see Tender's default design. Customize it to make it yours.";
    case "unpublished":
      return `Draft saved${at(status.savedAt)}. Buyers see the default design until you publish.`;
    case "changes":
      return `Published${at(status.publishedAt)}. Changes saved${at(status.savedAt)} aren't live yet.`;
    case "published":
      return `Published${at(status.publishedAt)}. Buyers see your latest changes.`;
  }
}
