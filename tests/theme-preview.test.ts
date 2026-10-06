import { describe, expect, it } from "vitest";

import {
  isPreviewSession,
  newPreviewSession,
  PREVIEW_FOCUS,
  PREVIEW_READY,
  PREVIEW_REFRESH,
  PREVIEW_SELECT,
  previewSource,
  readPreviewMessage,
} from "@/lib/theme/preview";
import { themeImageRejectionReason, MAX_THEME_IMAGE_BYTES } from "@/lib/theme/uploads";

describe("previewSource", () => {
  const staged = { session: "abc12345" };

  it("shows the staged copy only to the editor session that staged it", () => {
    expect(previewSource(staged, "abc12345")).toBe("staged");
  });

  it("shows the saved draft to any other session, or none", () => {
    expect(previewSource(staged, "zzz99999")).toBe("draft");
    expect(previewSource(staged, null)).toBe("draft");
    expect(previewSource(null, "abc12345")).toBe("draft");
  });
});

describe("preview sessions", () => {
  it("are random, and shaped as the server and database expect", () => {
    const sessions = new Set(Array.from({ length: 50 }, () => newPreviewSession()));
    expect(sessions.size).toBe(50);
    for (const session of sessions) expect(isPreviewSession(session)).toBe(true);
  });

  it("refuse anything else", () => {
    for (const value of [null, "", "short", "UPPERCASE1", "has space 1", "a".repeat(33), 12345678]) {
      expect(isPreviewSession(value)).toBe(false);
    }
  });
});

describe("readPreviewMessage", () => {
  it("reads the editor's and the preview's messages", () => {
    expect(readPreviewMessage({ type: PREVIEW_REFRESH })).toEqual({ type: PREVIEW_REFRESH });
    expect(readPreviewMessage({ type: PREVIEW_READY, extra: 1 })).toEqual({ type: PREVIEW_READY });
    expect(readPreviewMessage({ type: PREVIEW_SELECT, sectionId: "hero" })).toEqual({
      type: PREVIEW_SELECT,
      sectionId: "hero",
    });
    expect(readPreviewMessage({ type: PREVIEW_FOCUS, sectionId: "new" })).toEqual({
      type: PREVIEW_FOCUS,
      sectionId: "new",
    });
  });

  it("ignores anything else another window might post", () => {
    for (const data of [
      null,
      PREVIEW_REFRESH,
      { type: "webpackHotUpdate" },
      { type: PREVIEW_SELECT },
      { type: PREVIEW_SELECT, sectionId: 42 },
      { type: PREVIEW_FOCUS, sectionId: "x".repeat(65) },
    ]) {
      expect(readPreviewMessage(data)).toBeNull();
    }
  });
});

describe("themeImageRejectionReason", () => {
  it("accepts web images that fit through a Server Action", () => {
    expect(themeImageRejectionReason({ type: "image/webp", size: 400_000 })).toBeNull();
    expect(themeImageRejectionReason({ type: "image/jpeg", size: MAX_THEME_IMAGE_BYTES })).toBeNull();
  });

  it("refuses other types, empty files and anything too large", () => {
    expect(themeImageRejectionReason({ type: "image/svg+xml", size: 10 })).toMatch(/JPEG/);
    expect(themeImageRejectionReason({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(
      themeImageRejectionReason({ type: "image/png", size: MAX_THEME_IMAGE_BYTES + 1 }),
    ).toMatch(/too large/);
  });
});
