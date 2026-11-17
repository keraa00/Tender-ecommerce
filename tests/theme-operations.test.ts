import { describe, expect, it } from "vitest";

import { defaultTheme, newSection } from "@/lib/theme/default-theme";
import { MAX_SECTIONS_PER_PAGE, THEME_ID_PATTERN, type ThemeDocument } from "@/lib/theme/document";
import { en } from "@/lib/i18n/admin/en";
import {
  addBlock as addBlockIn,
  addBlockBlockedReason as blockBlockedIn,
  addSection as addSectionIn,
  addSectionBlockedReason as sectionBlockedIn,
  findSection,
  moveBlock,
  moveBlockTo,
  moveSection,
  moveSectionTo,
  removeBlock,
  removeSection,
  sectionPath,
  setBlockHidden,
  setSectionHidden,
  settingsIssues,
  themeIds,
  uniqueId,
  updateSetting,
  type BlockedCopy,
  type ManifestLike,
} from "@/lib/theme/operations";
import { sectionManifests } from "@/lib/theme/registry";
import { parseThemeForWrite } from "@/lib/theme/validate";

const manifests = new Map(sectionManifests().map((manifest) => [manifest.type, manifest]));
const manifest = (type: string) => manifests.get(type)!;

const EN: BlockedCopy = { locale: "en", t: en.themeEditor.operations };
const addSection = (document: ThemeDocument, m: ManifestLike, index?: number) =>
  addSectionIn(document, m, EN, index);
const addSectionBlockedReason = (document: ThemeDocument, m: ManifestLike) =>
  sectionBlockedIn(document, m, EN);
const addBlock = (document: ThemeDocument, sectionId: string, m: ManifestLike, type: string) =>
  addBlockIn(document, sectionId, m, type, EN);
const addBlockBlockedReason = (
  document: ThemeDocument,
  sectionId: string,
  m: ManifestLike,
  type: string,
) => blockBlockedIn(document, sectionId, m, type, EN);

const ids = (document: ThemeDocument) => document.pages.home.sections.map((section) => section.id);

/** A document and a deep copy of it, to prove an operation left it alone. */
function fixture() {
  const document = defaultTheme();
  return { document, before: structuredClone(document) };
}

describe("uniqueId", () => {
  it("uses the base when free, then numbers it", () => {
    expect(uniqueId("rich-text", new Set())).toBe("rich-text");
    expect(uniqueId("rich-text", new Set(["rich-text"]))).toBe("rich-text-2");
    expect(uniqueId("rich-text", new Set(["rich-text", "rich-text-2"]))).toBe("rich-text-3");
  });

  it("always produces an id the validator accepts", () => {
    for (const base of ["Image With Text!!", "--x--", "", "a".repeat(40), "featured-collections"]) {
      const taken = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const id = uniqueId(base, taken);
        expect(id).toMatch(THEME_ID_PATTERN);
        expect(taken.has(id)).toBe(false);
        taken.add(id);
      }
    }
  });
});

describe("addSection", () => {
  it("appends a section with default settings and an unused id", () => {
    const { document, before } = fixture();
    const result = addSection(document, manifest("rich-text"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.document)).toEqual(["hero", "collections", "new", "rich-text"]);
    expect(result.id).toBe("rich-text");
    expect(result.document.pages.home.sections[3]).toEqual(
      newSection("rich-text", "rich-text", [
        { id: "rich-text-heading", type: "heading" },
        { id: "rich-text-text", type: "text" },
      ]),
    );
    expect(document).toEqual(before);
  });

  it("starts a section with its starting blocks, under ids nothing else uses", () => {
    const { document } = fixture();
    const first = addSection(document, manifest("rich-text"));
    if (!first.ok) throw new Error("expected a rich text section");
    const second = addSection(first.document, manifest("rich-text"));
    if (!second.ok) throw new Error("expected a second rich text section");

    expect(findSection(second.document, "rich-text-2")!.blocks.map((block) => block.id)).toEqual([
      "rich-text-2-heading",
      "rich-text-2-text",
    ]);
    expect(parseThemeForWrite(second.document)).toEqual({ ok: true, theme: second.document });

    const grid = addSection(document, manifest("product-grid"));
    expect(grid.ok && findSection(grid.document, grid.id)!.blocks).toEqual([]);
  });

  it("inserts at a position, clamped to the page", () => {
    const { document } = fixture();
    const first = addSection(document, manifest("rich-text"), 0);
    const far = addSection(document, manifest("rich-text"), 99);
    expect(first.ok && ids(first.document)[0]).toBe("rich-text");
    expect(far.ok && ids(far.document).at(-1)).toBe("rich-text");
  });

  it("never reuses an id, including a block's", () => {
    const { document } = fixture();
    const twice = addSection(document, manifest("hero"));
    expect(twice.ok && twice.id).toBe("hero-2");

    const taken = defaultTheme();
    taken.pages.home.sections[0].blocks[0].id = "rich-text";
    const result = addSection(taken, manifest("rich-text"));
    expect(result.ok && result.id).toBe("rich-text-2");
  });

  it("refuses the header and footer, and types at their per-page limit", () => {
    const { document } = fixture();
    expect(addSection(document, manifest("header"))).toEqual({
      ok: false,
      reason: "“Header” is always on the page.",
    });

    let full = document;
    for (let i = 0; i < 2; i++) {
      const result = addSection(full, manifest("hero"));
      if (result.ok) full = result.document;
    }
    expect(addSectionBlockedReason(full, manifest("hero"))).toBe(
      "A page holds at most 3 of “Image banner”.",
    );
  });

  it("refuses once the page is full", () => {
    const document = defaultTheme();
    document.pages.home.sections = Array.from({ length: MAX_SECTIONS_PER_PAGE }, (_, i) =>
      newSection(i < 10 ? "rich-text" : "image-with-text", `s-${i}`),
    );
    expect(addSection(document, manifest("product-grid"))).toEqual({
      ok: false,
      reason: `A page holds at most ${MAX_SECTIONS_PER_PAGE} sections.`,
    });
  });
});

describe("moving sections", () => {
  it("moves one step up or down, and not past either end", () => {
    const { document, before } = fixture();
    expect(ids(moveSection(document, "new", -1))).toEqual(["hero", "new", "collections"]);
    expect(ids(moveSection(document, "hero", 1))).toEqual(["collections", "hero", "new"]);
    expect(moveSection(document, "hero", -1)).toBe(document);
    expect(moveSection(document, "new", 1)).toBe(document);
    expect(document).toEqual(before);
  });

  it("moves to any index, clamped", () => {
    const { document } = fixture();
    expect(ids(moveSectionTo(document, "hero", 2))).toEqual(["collections", "new", "hero"]);
    expect(ids(moveSectionTo(document, "new", -5))).toEqual(["new", "hero", "collections"]);
    expect(moveSectionTo(document, "collections", 1)).toBe(document);
  });

  it("leaves the header, the footer and unknown ids where they are", () => {
    const { document } = fixture();
    expect(moveSection(document, "header", 1)).toBe(document);
    expect(moveSectionTo(document, "footer", 0)).toBe(document);
    expect(moveSection(document, "nope", 1)).toBe(document);
  });
});

describe("removing and hiding", () => {
  it("removes a page section and nothing else", () => {
    const { document, before } = fixture();
    expect(ids(removeSection(document, "collections"))).toEqual(["hero", "new"]);
    expect(removeSection(document, "header")).toBe(document);
    expect(removeSection(document, "footer")).toBe(document);
    expect(document).toEqual(before);
  });

  it("hides and shows without touching settings", () => {
    const { document, before } = fixture();
    const hidden = setSectionHidden(document, "hero", true);
    expect(hidden.pages.home.sections[0]).toEqual({ ...before.pages.home.sections[0], hidden: true });
    expect(setSectionHidden(hidden, "hero", false).pages.home.sections[0]).toEqual(
      before.pages.home.sections[0],
    );
    expect(setSectionHidden(document, "hero", false)).toBe(document);
    expect(setSectionHidden(document, "header", true)).toBe(document);
    expect(document).toEqual(before);
  });
});

describe("updateSetting", () => {
  it("sets a theme setting", () => {
    const { document, before } = fixture();
    const next = updateSetting(document, { kind: "theme" }, "accent", "#b4552d");
    expect(next.settings.accent).toBe("#b4552d");
    expect(document).toEqual(before);
  });

  it("sets a setting on a page section, the header or the footer", () => {
    const { document, before } = fixture();
    const grid = updateSetting(document, { kind: "section", id: "new" }, "limit", 12);
    expect(grid.pages.home.sections[2].settings.limit).toBe(12);
    expect(grid.layout).toBe(document.layout);

    const header = updateSetting(document, { kind: "section", id: "header" }, "showLogo", false);
    expect(header.layout.header.settings.showLogo).toBe(false);
    expect(header.layout.footer).toEqual(before.layout.footer);
    expect(header.pages).toBe(document.pages);

    expect(document).toEqual(before);
  });

  it("ignores a section that is not there", () => {
    const { document } = fixture();
    expect(updateSetting(document, { kind: "section", id: "gone" }, "limit", 12)).toBe(document);
  });

  it("keeps a document the server accepts through a run of edits", () => {
    let document = defaultTheme();
    const added = addSection(document, manifest("image-with-text"), 1);
    if (added.ok) document = added.document;
    document = updateSetting(document, { kind: "section", id: "image-with-text" }, "heading", "Hand-thrown");
    document = moveSection(document, "new", -1);
    document = setSectionHidden(document, "collections", true);
    document = removeSection(document, "hero");
    document = updateSetting(document, { kind: "theme" }, "headingFont", "fraunces");

    const parsed = parseThemeForWrite(JSON.parse(JSON.stringify(document)));
    expect(parsed).toEqual({ ok: true, theme: document });
    expect(ids(document)).toEqual(["image-with-text", "new", "collections"]);
  });
});

describe("settingsIssues", () => {
  const document = defaultTheme();

  it("picks out the issues about one section's settings, by key", () => {
    const issues = [
      { path: "pages.home.sections.2.settings.limit", message: "Use at most 24." },
      { path: "pages.home.sections.2.settings.limit", message: "Second, ignored." },
      { path: "pages.home.sections.0.settings.heading", message: "Not this section." },
      { path: "settings.accent", message: "Theme." },
      { path: "layout.header.settings.showLogo", message: "Header." },
    ];
    expect(settingsIssues(document, { kind: "section", id: "new" }, issues)).toEqual({
      limit: "Use at most 24.",
    });
    expect(settingsIssues(document, { kind: "theme" }, issues)).toEqual({ accent: "Theme." });
    expect(settingsIssues(document, { kind: "section", id: "header" }, issues)).toEqual({
      showLogo: "Header.",
    });
    expect(settingsIssues(document, { kind: "section", id: "gone" }, issues)).toEqual({});
  });

  it("finds a section's settings wherever it sits in the document", () => {
    expect(
      settingsIssues(document, { kind: "section", id: "hero" }, [
        { path: "pages.home.sections.0.settings.heading", message: "Too long." },
      ]),
    ).toEqual({ heading: "Too long." });
    expect(sectionPath(document, "footer")).toBe("layout.footer");
    expect(sectionPath(document, "collections")).toBe("pages.home.sections.1");
  });
});

describe("themeIds", () => {
  it("lists every section and block id", () => {
    expect([...themeIds(defaultTheme())].sort()).toEqual(
      ["collections", "footer", "header", "hero", "hero-button", "new"].sort(),
    );
  });
});

describe("blocks", () => {
  const hero = { kind: "block", sectionId: "hero", blockId: "hero-button" } as const;

  it("adds a block of an allowed type at its defaults, with an unused id", () => {
    const { document, before } = fixture();
    const result = addBlock(document, "hero", manifest("hero"), "button");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("hero-button-2");
    expect(result.document.pages.home.sections[0].blocks.map((block) => block.id)).toEqual([
      "hero-button",
      "hero-button-2",
    ]);
    expect(result.document.pages.home.sections[0].blocks[1].settings).toEqual({
      label: "",
      link: { kind: "catalog" },
      style: "primary",
    });
    expect(document).toEqual(before);
  });

  it("refuses a type the section does not take, and one past its limit", () => {
    const { document } = fixture();
    expect(addBlockBlockedReason(document, "hero", manifest("hero"), "heading")).toBe(
      "“Image banner” cannot hold that.",
    );
    expect(addBlockBlockedReason(document, "gone", manifest("hero"), "button")).toBe(
      "That section is no longer on the page.",
    );

    const second = addBlock(document, "hero", manifest("hero"), "button");
    if (!second.ok) throw new Error("expected a second button");
    expect(addBlock(second.document, "hero", manifest("hero"), "button")).toEqual({
      ok: false,
      reason: "“Image banner” holds at most 2 blocks.",
    });
  });

  it("moves, hides and removes blocks within their section only", () => {
    let document = defaultTheme();
    const story = addSection(document, manifest("rich-text"));
    if (!story.ok) throw new Error("expected a rich text section");
    // It starts with a heading and text; a button joins them.
    const button = addBlock(story.document, "rich-text", manifest("rich-text"), "button");
    if (!button.ok) throw new Error("expected a button block");
    document = button.document;
    const blockIds = (doc: ThemeDocument) =>
      findSection(doc, "rich-text")!.blocks.map((block) => block.id);
    expect(blockIds(document)).toEqual(["rich-text-heading", "rich-text-text", "rich-text-button"]);

    const before = structuredClone(document);
    expect(blockIds(moveBlock(document, "rich-text", "rich-text-button", -1))).toEqual([
      "rich-text-heading",
      "rich-text-button",
      "rich-text-text",
    ]);
    expect(blockIds(moveBlockTo(document, "rich-text", "rich-text-heading", 9))).toEqual([
      "rich-text-text",
      "rich-text-button",
      "rich-text-heading",
    ]);
    expect(moveBlock(document, "rich-text", "rich-text-heading", -1)).toBe(document);

    const hidden = setBlockHidden(document, "rich-text", "rich-text-text", true);
    expect(findSection(hidden, "rich-text")!.blocks[1].hidden).toBe(true);
    expect(setBlockHidden(document, "rich-text", "rich-text-text", false)).toBe(document);

    expect(blockIds(removeBlock(document, "rich-text", "rich-text-text"))).toEqual([
      "rich-text-heading",
      "rich-text-button",
    ]);
    expect(removeBlock(document, "rich-text", "nope")).toBe(document);
    expect(removeBlock(document, "hero", "rich-text-text")).toBe(document);

    expect(document).toEqual(before);
  });

  it("sets a block's setting without touching its siblings", () => {
    const { document, before } = fixture();
    const next = updateSetting(document, hero, "label", "Shop autumn");
    expect(next.pages.home.sections[0].blocks[0].settings.label).toBe("Shop autumn");
    expect(next.pages.home.sections[1]).toBe(document.pages.home.sections[1]);
    expect(updateSetting(document, { ...hero, blockId: "gone" }, "label", "x")).toBe(document);
    expect(document).toEqual(before);
  });

  it("finds the issues about one block's settings", () => {
    const { document } = fixture();
    expect(
      settingsIssues(document, hero, [
        { path: "pages.home.sections.0.blocks.0.settings.link", message: "Use a web address." },
        { path: "pages.home.sections.0.settings.heading", message: "Section, not block." },
      ]),
    ).toEqual({ link: "Use a web address." });
  });

  it("keeps a document the server accepts through block edits", () => {
    let document = defaultTheme();
    const added = addBlock(document, "hero", manifest("hero"), "button");
    if (added.ok) document = added.document;
    document = updateSetting(document, { kind: "block", sectionId: "hero", blockId: added.ok ? added.id : "" }, "style", "secondary");
    document = moveBlock(document, "hero", "hero-button", 1);
    document = setBlockHidden(document, "hero", "hero-button", true);

    expect(parseThemeForWrite(JSON.parse(JSON.stringify(document)))).toEqual({
      ok: true,
      theme: document,
    });
  });
});
