import { describe, expect, it } from "vitest";

import {
  hasUnpublishedChanges,
  parseThemeVersion,
  themeStatus,
  themeStatusBadge,
  themeStatusSummary,
} from "@/lib/theme/status";

const saved = new Date("2026-10-05T12:30:00Z");
const published = new Date("2026-10-04T09:15:00Z");

const record = (draftVersion: number, publishedVersion: number | null) => ({
  draftVersion,
  publishedVersion,
  draftSavedAt: saved,
  publishedAt: publishedVersion === null ? null : published,
});

describe("themeStatus", () => {
  it("is the default theme before the store saves one", () => {
    const status = themeStatus(null);
    expect(status).toEqual({ kind: "default" });
    expect(hasUnpublishedChanges(status)).toBe(false);
    expect(themeStatusBadge(status)).toEqual({ label: "Live", tone: "success" });
    expect(themeStatusSummary(status)).toMatch(/default design/);
  });

  it("is waiting to go live after a save that was never published", () => {
    const status = themeStatus(record(2, null));
    expect(status.kind).toBe("unpublished");
    expect(hasUnpublishedChanges(status)).toBe(true);
    expect(themeStatusBadge(status).label).toBe("Not published");
    expect(themeStatusSummary(status)).toBe(
      "Draft saved 5 Oct 2026, 12:30. Buyers see the default design until you publish.",
    );
  });

  it("has unpublished changes once the draft moves past what was published", () => {
    const status = themeStatus(record(3, 2));
    expect(status.kind).toBe("changes");
    expect(hasUnpublishedChanges(status)).toBe(true);
    expect(themeStatusSummary(status)).toBe(
      "Published 4 Oct 2026, 09:15. Changes saved 5 Oct 2026, 12:30 aren't live yet.",
    );
  });

  it("is live when the latest draft is the published one", () => {
    const status = themeStatus(record(3, 3));
    expect(status.kind).toBe("published");
    expect(hasUnpublishedChanges(status)).toBe(false);
    expect(themeStatusBadge(status)).toEqual({ label: "Live", tone: "success" });
  });
});

describe("parseThemeVersion", () => {
  it("accepts the whole numbers a form posts", () => {
    expect(parseThemeVersion("0")).toBe(0);
    expect(parseThemeVersion("17")).toBe(17);
  });

  it("refuses anything else", () => {
    for (const value of [null, "", "-1", "1.5", "1e3", " 2", "abc", "9999999999", 3]) {
      expect(parseThemeVersion(value)).toBeNull();
    }
  });
});
