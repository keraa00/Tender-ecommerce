import { describe, expect, it } from "vitest";

import { storefrontAppearance } from "@/lib/theme/appearance";
import { defaultTheme, newSection } from "@/lib/theme/default-theme";
import { themeCollectionReferences } from "@/lib/theme/references";
import { THEME_FONTS, themeFontStack } from "@/lib/theme/typography";

const defaults = defaultTheme().settings;

describe("storefrontAppearance", () => {
  it("adds nothing but the light palette and the accent for a theme left at its defaults", () => {
    expect(storefrontAppearance(defaults, "#14504f")).toEqual({
      attributes: { "data-color-scheme": "light" },
      style: { "--store-accent": "#14504f" },
      fonts: [],
    });
  });

  it("takes the theme's accent, then the store's, then the platform's", () => {
    const style = (accent: string | null, store: string | null) =>
      storefrontAppearance({ ...defaults, accent }, store).style["--store-accent"];
    expect(style("#b4552d", "#14504f")).toBe("#b4552d");
    expect(style(null, "#14504f")).toBe("#14504f");
    expect(style(null, null)).toBe("var(--primary)");
  });

  it("always pins the light palette, so a buyer's dark mode never reaches the storefront", () => {
    // A theme saved while the colour scheme setting existed still reads as light.
    const stale = { ...defaults, colorScheme: "dark" } as typeof defaults;
    expect(storefrontAppearance(stale, null).attributes["data-color-scheme"]).toBe("light");
  });

  it("sets both font stacks once either font departs from the default", () => {
    const appearance = storefrontAppearance({ ...defaults, headingFont: "fraunces" }, null);
    expect(appearance.attributes).toEqual({ "data-color-scheme": "light", "data-theme-fonts": "" });
    expect(appearance.style["--theme-font-heading"]).toBe(themeFontStack("fraunces"));
    expect(appearance.style["--theme-font-body"]).toBe(themeFontStack("geist"));
    expect(appearance.fonts).toEqual(["fraunces", "geist"]);
  });
});

describe("THEME_FONTS", () => {
  it("has unique ids, each stack ending in a generic family", () => {
    const ids = THEME_FONTS.map((font) => font.value);
    expect(new Set(ids).size).toBe(ids.length);
    for (const font of THEME_FONTS) {
      expect(font.stack).toMatch(/^var\(--font-[\w-]+\), .*(sans-serif|serif)$/);
    }
  });

  it("falls back to the default stack for an id it does not know", () => {
    expect(themeFontStack("comic-sans" as never)).toBe(themeFontStack("geist"));
  });
});

describe("themeCollectionReferences", () => {
  const A = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7b";
  const B = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7c";

  it("finds a theme's collections in settings, lists and links, with where", () => {
    const theme = defaultTheme();
    theme.pages.home.sections[1].settings.collectionIds = [A, B];
    theme.pages.home.sections[2].settings.collectionId = B;
    theme.pages.home.sections[0].blocks[0].settings.link = { kind: "collection", collectionId: A };
    const story = newSection("rich-text", "story", [{ id: "story-button", type: "button" }]);
    story.blocks[0].settings.link = { kind: "catalog" };
    theme.pages.home.sections.push(story);

    expect(themeCollectionReferences(theme)).toEqual([
      { id: A, path: "pages.home.sections.0.blocks.0.settings.link" },
      { id: A, path: "pages.home.sections.1.settings.collectionIds" },
      { id: B, path: "pages.home.sections.1.settings.collectionIds" },
      { id: B, path: "pages.home.sections.2.settings.collectionId" },
    ]);
  });

  it("finds none in the default theme", () => {
    expect(themeCollectionReferences(defaultTheme())).toEqual([]);
  });
});
