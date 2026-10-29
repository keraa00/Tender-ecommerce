import { describe, expect, it } from "vitest";

import { LOCALES } from "@/lib/i18n/locales";
import { MESSAGES } from "@/lib/i18n/messages";
import { defaultTheme } from "@/lib/theme/default-theme";
import { textOr } from "@/lib/theme/fields";
import { linkHref } from "@/lib/theme/links";
import { getSectionDefinition, sectionManifests } from "@/lib/theme/registry";
import { pickCollections } from "@/lib/theme/sections/featured-collections";
import { heroContent } from "@/lib/theme/sections/hero";
import { storefrontPaths } from "@/lib/storefront/links";

const theme = defaultTheme();
const [hero, collections, newArrivals] = theme.pages.home.sections;

describe("defaultTheme", () => {
  it("is the home page as it was hard-coded: banner, collections, new arrivals", () => {
    expect(theme.layout.header.type).toBe("header");
    expect(theme.layout.footer.type).toBe("footer");
    expect(theme.pages.home.sections.map((section) => [section.id, section.type])).toEqual([
      ["hero", "hero"],
      ["collections", "featured-collections"],
      ["new", "product-grid"],
    ]);
    expect(theme.pages.home.sections.every((section) => !section.hidden)).toBe(true);
  });

  it("shows every collection and the eight newest products, with View all", () => {
    expect(collections.settings).toMatchObject({ source: "all", collectionIds: [] });
    expect(newArrivals.settings).toMatchObject({
      collectionId: null,
      limit: 8,
      showViewAll: true,
    });
  });

  it("keeps the header's accent square and the footer's credit", () => {
    expect(theme.layout.header.settings).toEqual({ showLogo: false });
    expect(theme.layout.footer.settings).toEqual({ showPoweredBy: true });
  });

  it("leaves the theme settings at the platform's look", () => {
    expect(theme.settings).toEqual({
      accent: null,
      headingFont: "geist",
      bodyFont: "geist",
    });
  });

  it("has one banner button, to the catalogue, in the accent colour", () => {
    expect(hero.blocks).toEqual([
      {
        id: "hero-button",
        type: "button",
        hidden: false,
        settings: { label: "", link: { kind: "catalog" }, style: "primary" },
      },
    ]);
  });

  it("stores no copy, so nothing is pinned to one language", () => {
    const texts = [theme.layout.header, theme.layout.footer, ...theme.pages.home.sections]
      .flatMap((section) => {
        const definition = getSectionDefinition(section.type)!;
        const own = Object.entries(definition.settings)
          .filter(([, field]) => field.kind === "text" || field.kind === "textarea")
          .map(([key]) => section.settings[key]);
        const blocks = section.blocks.flatMap((block) =>
          Object.entries(definition.blocks[block.type].settings)
            .filter(([, field]) => field.kind === "text" || field.kind === "textarea")
            .map(([key]) => block.settings[key]),
        );
        return [...own, ...blocks];
      });

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((text) => text === "")).toBe(true);
  });

  it("falls back to the buyer's language for every locale", () => {
    for (const locale of LOCALES) {
      const t = MESSAGES[locale];
      expect(textOr(hero.blocks[0].settings.label as string, t.home.shopAll)).toBe(t.home.shopAll);
      expect(textOr(collections.settings.heading as string, t.home.collections)).toBe(
        t.home.collections,
      );
      expect(textOr(newArrivals.settings.heading as string, t.home.newArrivals)).toBe(
        t.home.newArrivals,
      );
      expect(t.home.shopAll && t.home.collections && t.home.newArrivals).toBeTruthy();
    }
  });

  it("is a fresh object each time", () => {
    const first = defaultTheme();
    first.pages.home.sections.pop();
    expect(defaultTheme().pages.home.sections).toHaveLength(3);
  });
});

describe("heroContent", () => {
  const store = {
    id: "store",
    slug: "rosewater-ceramics",
    name: "Rosewater Ceramics",
    description: "Stoneware, thrown and glazed by hand.",
    logoUrl: null,
    bannerUrl: "https://live.staticflickr.com/banner.jpg",
    currency: "USD",
  };
  const empty = { image: null, heading: "", text: "" };

  it("falls back to the store's banner, name and description", () => {
    expect(heroContent(empty, { store })).toEqual({
      image: store.bannerUrl,
      heading: store.name,
      text: store.description,
    });
  });

  it("has no text and no image for a store with neither", () => {
    expect(heroContent(empty, { store: { ...store, description: null, bannerUrl: null } })).toEqual({
      image: null,
      heading: store.name,
      text: "",
    });
  });

  it("prefers what the seller set", () => {
    const own = { image: "https://x.supabase.co/a.webp", heading: "Autumn kiln", text: "Out now." };
    expect(heroContent(own, { store })).toEqual(own);
  });
});

describe("linkHref", () => {
  const paths = storefrontPaths("acme");
  const available = [{ id: "c1", slug: "mugs" }];

  it("resolves storefront pages within this store", () => {
    expect(linkHref({ kind: "home" }, paths, available)).toBe("/s/acme");
    expect(linkHref({ kind: "catalog" }, paths, available)).toBe("/s/acme/catalog");
    expect(linkHref({ kind: "contact" }, paths, available)).toBe("/s/acme/contact");
    expect(linkHref({ kind: "url", url: "https://example.com" }, paths, available)).toBe(
      "https://example.com",
    );
  });

  it("sends a collection that has no page any more to the catalogue", () => {
    expect(linkHref({ kind: "collection", collectionId: "c1" }, paths, available)).toBe(
      "/s/acme/collections/mugs",
    );
    expect(linkHref({ kind: "collection", collectionId: "gone" }, paths, available)).toBe(
      "/s/acme/catalog",
    );
  });
});

describe("pickCollections", () => {
  const available = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("shows all, or the chosen ones in the seller's order, dropping unknown ids", () => {
    expect(pickCollections(available, "all", ["c"])).toEqual(available);
    expect(pickCollections(available, "selected", ["c", "zzz", "a"])).toEqual([
      { id: "c" },
      { id: "a" },
    ]);
    expect(pickCollections(available, "selected", [])).toEqual([]);
  });
});

describe("sectionManifests", () => {
  it("describes every section type as plain data the editor can receive", () => {
    const manifests = sectionManifests();
    expect(manifests.map((manifest) => manifest.type).sort()).toEqual([
      "featured-collections",
      "footer",
      "header",
      "hero",
      "image-with-text",
      "product-grid",
      "rich-text",
    ]);
    expect(JSON.parse(JSON.stringify(manifests))).toEqual(manifests);
    expect(manifests.every((manifest) => !("Component" in manifest))).toBe(true);
  });

  it("gives the pinned sections one slot each and no blocks", () => {
    for (const manifest of sectionManifests().filter((entry) => entry.pinned)) {
      expect(manifest.maxPerPage).toBe(1);
      expect(manifest.maxBlocks).toBe(0);
    }
  });
});
