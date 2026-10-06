import { describe, expect, it } from "vitest";

import { defaultTheme, newSection } from "@/lib/theme/default-theme";
import { MAX_SECTIONS_PER_PAGE, type ThemeDocument } from "@/lib/theme/document";
import {
  parseThemeForWrite,
  storeImageUrlPolicy,
  type ParsedTheme,
} from "@/lib/theme/validate";

const STORE_ID = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7b";
const OTHER_STORE_ID = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7c";
const SUPABASE_URL = "https://project.supabase.co";
const upload = (storeId: string, name = "banner.webp") =>
  `${SUPABASE_URL}/storage/v1/object/public/product-images/${storeId}/${name}`;

/** A default theme to edit, as a browser would send it: plain JSON. */
function theme(edit?: (draft: ThemeDocument) => void): unknown {
  const draft = defaultTheme();
  edit?.(draft);
  return JSON.parse(JSON.stringify(draft));
}

function issues(result: ParsedTheme) {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}

describe("parseThemeForWrite", () => {
  it("accepts the default theme unchanged", () => {
    expect(parseThemeForWrite(theme())).toEqual({ ok: true, theme: defaultTheme() });
  });

  it("fills settings left out with their defaults and drops undeclared ones", () => {
    const result = parseThemeForWrite(
      theme((draft) => {
        draft.pages.home.sections[2].settings = { limit: 12, colour: "pink" };
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.pages.home.sections[2].settings).toEqual({
      heading: "",
      collectionId: null,
      limit: 12,
      showViewAll: true,
    });
  });

  it("rejects things that are not a theme at all", () => {
    expect(parseThemeForWrite(null).ok).toBe(false);
    expect(parseThemeForWrite("theme").ok).toBe(false);
    expect(parseThemeForWrite(theme((draft) => {
      (draft as { schemaVersion: number }).schemaVersion = 2;
    })).ok).toBe(false);
  });

  it("names a section type the registry does not have", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections.push({ ...newSection("rich-text", "story"), type: "carousel" });
        }),
      ),
    );
    expect(found).toContainEqual({
      path: "pages.home.sections.3.type",
      message: 'There is no "carousel" section.',
    });
  });

  it("rejects ids used twice anywhere in the document", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections.push(newSection("rich-text", "hero-button"));
        }),
      ),
    );
    expect(found.map((issue) => issue.path)).toContain("pages.home.sections.3.id");
  });

  it("rejects ids that are not short and attribute-safe", () => {
    for (const id of ["", "Hero", "has space", "a".repeat(25), "-leading"]) {
      expect(
        parseThemeForWrite(theme((draft) => {
          draft.pages.home.sections[0].id = id;
        })).ok,
      ).toBe(false);
    }
  });

  it("holds a page to its section limit", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections = Array.from({ length: MAX_SECTIONS_PER_PAGE + 1 }, (_, i) =>
            newSection("rich-text", `text-${i}`),
          );
        }),
      ),
    );
    expect(found[0].path).toBe("pages.home.sections");
  });

  it("holds each section type to its per-page limit", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections = ["a", "b", "c", "d"].map((id) => newSection("hero", id));
        }),
      ),
    );
    expect(found).toEqual([
      { path: "pages.home.sections.3", message: "A page holds at most 3 of “Image banner”." },
    ]);
  });

  it("rejects a block the section does not take", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections[1].blocks.push({
            id: "stray",
            type: "button",
            hidden: false,
            settings: {},
          });
        }),
      ),
    );
    expect(found[0].path).toBe("pages.home.sections.1.blocks.0.type");
  });

  it("holds a section to its block limit", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections[0] = newSection("hero", "hero", [
            { id: "b1", type: "button" },
            { id: "b2", type: "button" },
            { id: "b3", type: "button" },
          ]);
        }),
      ),
    );
    expect(found).toEqual([
      { path: "pages.home.sections.0.blocks", message: "A image banner holds at most 2 blocks." },
    ]);
  });

  it("keeps the header and footer in their slots and off the page", () => {
    expect(
      issues(parseThemeForWrite(theme((draft) => {
        draft.pages.home.sections.push(newSection("header", "second-header"));
      })))[0].path,
    ).toBe("pages.home.sections.3.type");

    expect(
      issues(parseThemeForWrite(theme((draft) => {
        draft.layout.header = newSection("hero", "header");
      })))[0].path,
    ).toBe("layout.header.type");
  });

  it("names the setting that is wrong", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.settings.accent = "teal";
          draft.pages.home.sections[0].settings.heading = "x".repeat(81);
          draft.pages.home.sections[0].blocks[0].settings.link = {
            kind: "url",
            url: "javascript:alert(document.cookie)",
          };
        }),
      ),
    );
    expect(found.map((issue) => issue.path)).toEqual([
      "settings.accent",
      "pages.home.sections.0.blocks.0.settings.link",
      "pages.home.sections.0.settings.heading",
    ]);
  });

  it("accepts only this store's uploads as images when given the store's policy", () => {
    const policy = { isAllowedImageUrl: storeImageUrlPolicy(STORE_ID, SUPABASE_URL) };
    const withImage = (url: string) =>
      theme((draft) => {
        draft.pages.home.sections[0].settings.image = url;
      });

    expect(parseThemeForWrite(withImage(upload(STORE_ID)), policy).ok).toBe(true);

    for (const url of [
      upload(OTHER_STORE_ID),
      upload(STORE_ID).replace("project.supabase.co", "evil.example"),
      `${SUPABASE_URL}/storage/v1/object/public/other-bucket/${STORE_ID}/a.webp`,
      `${SUPABASE_URL}/storage/v1/object/public/product-images/${STORE_ID}/../${OTHER_STORE_ID}/a.webp`,
      "https://live.staticflickr.com/banner.jpg",
    ]) {
      expect(issues(parseThemeForWrite(withImage(url), policy))).toEqual([
        {
          path: "pages.home.sections.0.settings.image",
          message: "Upload the image to use it here.",
        },
      ]);
    }
  });

  it("refuses a document too large to save", () => {
    const found = issues(
      parseThemeForWrite(
        theme((draft) => {
          draft.pages.home.sections[0].settings.padding = "x".repeat(250_000);
        }),
      ),
    );
    expect(found[0].message).toMatch(/too large/);
  });
});
