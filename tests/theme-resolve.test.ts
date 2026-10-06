import { describe, expect, it } from "vitest";

import { defaultTheme, newSection } from "@/lib/theme/default-theme";
import { MAX_SECTIONS_PER_PAGE, type ThemeDocument } from "@/lib/theme/document";
import { parseThemeForWrite, resolveTheme } from "@/lib/theme/validate";

/** A stored document, as JSON straight out of the database. */
function stored(edit?: (draft: Record<string, unknown> & ThemeDocument) => void): unknown {
  const draft = JSON.parse(JSON.stringify(defaultTheme()));
  edit?.(draft);
  return draft;
}

const types = (theme: ThemeDocument) => theme.pages.home.sections.map((s) => s.type);

describe("resolveTheme", () => {
  it("falls back to the default theme for anything that is not one", () => {
    for (const raw of [null, undefined, "theme", 42, [], {}, { schemaVersion: 2 }]) {
      expect(resolveTheme(raw)).toEqual(defaultTheme());
    }
  });

  it("reads back what a write accepted, exactly", () => {
    const draft = defaultTheme();
    draft.settings.accent = "#b4552d";
    draft.pages.home.sections.push(
      newSection("rich-text", "story", [
        { id: "story-heading", type: "heading" },
        { id: "story-text", type: "text" },
      ]),
    );
    draft.pages.home.sections[0].hidden = true;
    draft.pages.home.sections[3].blocks[1].settings.text = "Made by hand.\nFired twice.";

    const written = parseThemeForWrite(JSON.parse(JSON.stringify(draft)));
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(resolveTheme(JSON.parse(JSON.stringify(written.theme)))).toEqual(written.theme);
  });

  it("skips sections whose type no longer exists and keeps the rest in order", () => {
    const theme = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections.splice(1, 0, {
          ...newSection("rich-text", "gone"),
          type: "testimonials",
        });
      }),
    );
    expect(types(theme)).toEqual(["hero", "featured-collections", "product-grid"]);
  });

  it("puts a setting that no longer fits back to its default, one setting at a time", () => {
    const theme = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections[2].settings = {
          heading: "Fresh from the kiln",
          limit: 99,
          showViewAll: "yes",
        };
      }),
    );
    expect(theme.pages.home.sections[2].settings).toEqual({
      heading: "Fresh from the kiln",
      collectionId: null,
      limit: 8,
      showViewAll: true,
    });
  });

  it("keeps hidden sections and blocks hidden", () => {
    const theme = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections[1].hidden = true;
        draft.pages.home.sections[0].blocks[0].hidden = true;
      }),
    );
    expect(theme.pages.home.sections[1].hidden).toBe(true);
    expect(theme.pages.home.sections[0].blocks[0].hidden).toBe(true);
    expect(theme.pages.home.sections[0].hidden).toBe(false);
  });

  it("drops blocks a section does not take and trims those over its limit", () => {
    const theme = resolveTheme(
      stored((draft) => {
        const hero = draft.pages.home.sections[0];
        hero.blocks = [
          { id: "h1", type: "heading", hidden: false, settings: {} },
          { id: "b1", type: "button", hidden: false, settings: {} },
          { id: "b2", type: "button", hidden: false, settings: {} },
          { id: "b3", type: "button", hidden: false, settings: {} },
        ];
      }),
    );
    expect(theme.pages.home.sections[0].blocks.map((block) => block.id)).toEqual(["b1", "b2"]);
  });

  it("keeps the first of two things sharing an id", () => {
    const theme = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections.push(newSection("rich-text", "hero"));
      }),
    );
    expect(types(theme)).toEqual(["hero", "featured-collections", "product-grid"]);
  });

  it("keeps the header and footer in their slots", () => {
    const theme = resolveTheme(
      stored((draft) => {
        draft.layout.header = newSection("hero", "imposter");
        draft.pages.home.sections.push(newSection("footer", "second-footer"));
      }),
    );
    expect(theme.layout.header).toEqual(defaultTheme().layout.header);
    expect(types(theme)).not.toContain("footer");
  });

  it("gives a page the document never had the default sections, but respects an emptied one", () => {
    expect(
      types(resolveTheme(stored((draft) => {
        draft.pages = {} as ThemeDocument["pages"];
      }))),
    ).toEqual(types(defaultTheme()));

    expect(
      types(resolveTheme(stored((draft) => {
        draft.pages.home.sections = [];
      }))),
    ).toEqual([]);
  });

  it("enforces the page and per-type limits on read too", () => {
    // 30 sections, each within its own type's limit, so only the page cap bites.
    const perType = { "rich-text": 10, "image-with-text": 10, "product-grid": 4, "featured-collections": 3, hero: 3 };
    const tooMany = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections = Object.entries(perType).flatMap(([type, count]) =>
          Array.from({ length: count }, (_, i) => newSection(type, `${type}-${i}`)),
        );
      }),
    );
    expect(tooMany.pages.home.sections).toHaveLength(MAX_SECTIONS_PER_PAGE);
    expect(tooMany.pages.home.sections.at(-1)?.id).toBe("featured-collections-0");

    const heroes = resolveTheme(
      stored((draft) => {
        draft.pages.home.sections = ["a", "b", "c", "d"].map((id) => newSection("hero", id));
      }),
    );
    expect(heroes.pages.home.sections.map((section) => section.id)).toEqual(["a", "b", "c"]);
  });
});
