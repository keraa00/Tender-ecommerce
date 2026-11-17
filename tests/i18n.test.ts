import { describe, expect, it } from "vitest";

import { LOCALES, localeDirection, resolveLocale } from "@/lib/i18n/locales";
import { format, MESSAGES, plural } from "@/lib/i18n/messages";
import { ADMIN_MESSAGES } from "@/lib/i18n/admin";
import { THEME_SETTINGS } from "@/lib/theme/document";
import type { Fields } from "@/lib/theme/fields";
import { sectionManifests } from "@/lib/theme/registry";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("storefront messages", () => {
  it("has no blank strings in any language", () => {
    for (const locale of LOCALES) {
      for (const key of leafKeys(MESSAGES[locale])) {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], MESSAGES[locale]);
        expect(typeof value === "string" && value.trim() !== "", `${locale}.${key}`).toBe(true);
      }
    }
  });

  it("uses Bosnian's three plural forms", () => {
    const forms = MESSAGES.bs.catalog.productCount;
    expect(plural("bs", 1, forms)).toBe("1 proizvod");
    expect(plural("bs", 3, forms)).toBe("3 proizvoda");
    expect(plural("bs", 21, forms)).toBe("21 proizvod");
    expect(plural("bs", 11, forms)).toBe("11 proizvoda");
    expect(plural("bs", 25, MESSAGES.bs.cart.itemCount)).toBe("25 artikala");
  });

  it("uses Russian's one/few/many forms", () => {
    const forms = MESSAGES.ru.catalog.productCount;
    expect(plural("ru", 1, forms)).toBe("1 товар");
    expect(plural("ru", 3, forms)).toBe("3 товара");
    expect(plural("ru", 5, forms)).toBe("5 товаров");
    expect(plural("ru", 11, forms)).toBe("11 товаров");
    expect(plural("ru", 21, forms)).toBe("21 товар");
  });

  it("uses all six Arabic forms, with Western digits", () => {
    const forms = MESSAGES.ar.catalog.productCount;
    expect(plural("ar", 0, forms)).toBe("لا توجد منتجات");
    expect(plural("ar", 1, forms)).toBe("منتج واحد");
    expect(plural("ar", 2, forms)).toBe("منتجان");
    expect(plural("ar", 5, forms)).toBe("5 منتجات");
    expect(plural("ar", 11, forms)).toBe("11 منتجًا");
    expect(plural("ar", 100, forms)).toBe("100 منتج");
  });

  it("gives Chinese and Japanese a single form", () => {
    expect(plural("zh", 1, MESSAGES.zh.catalog.productCount)).toBe("1 件商品");
    expect(plural("ja", 3, MESSAGES.ja.cart.itemCount)).toBe("3点");
  });

  it("falls back to `other` for categories a language does not define", () => {
    expect(plural("en", 2, MESSAGES.en.catalog.productCount)).toBe("2 products");
    expect(plural("es", 1_000_000, MESSAGES.es.catalog.productCount)).toMatch(/productos$/);
    expect(plural("fr", 1_000_000, MESSAGES.fr.catalog.productCount)).toMatch(/ de produits$/);
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(format("Hi {name}, {missing}", { name: "Ana" })).toBe("Hi Ana, {missing}");
  });

  it("resolves an unrecognised cookie to English", () => {
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("sv")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("lays Arabic out right to left and everything else left to right", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(LOCALES.filter((locale) => localeDirection(locale) === "rtl")).toEqual(["ar"]);
  });
});

// ---------------------------------------------------------------------------
// The seller admin's copy
// ---------------------------------------------------------------------------

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

function isPluralForms(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "other" in value &&
    Object.keys(value).every((key) => PLURAL_CATEGORIES.has(key))
  );
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

/** Every string in a message tree with its path, plural forms kept together. */
function entries(value: unknown, path = ""): [string, unknown][] {
  if (typeof value === "string" || Array.isArray(value) || isPluralForms(value)) {
    return [[path, value]];
  }
  if (typeof value !== "object" || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    entries(child, path ? `${path}.${key}` : key),
  );
}

function at(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe("admin messages", () => {
  it("has no blank strings in any language", () => {
    for (const locale of LOCALES) {
      for (const key of leafKeys(ADMIN_MESSAGES[locale])) {
        const value = at(ADMIN_MESSAGES[locale], key);
        expect(typeof value === "string" && value.trim() !== "", `${locale}.${key}`).toBe(true);
      }
    }
  });

  it("keeps every placeholder the English copy fills", () => {
    for (const locale of LOCALES) {
      for (const [path, english] of entries(ADMIN_MESSAGES.en)) {
        const translated = at(ADMIN_MESSAGES[locale], path);
        const label = `${locale}.${path}`;

        if (typeof english === "string") {
          expect(placeholders(translated as string), label).toEqual(placeholders(english));
        } else if (isPluralForms(english)) {
          expect(isPluralForms(translated), label).toBe(true);
          const forms = translated as Record<string, string>;
          const expected = placeholders(english.other);
          // `other` says everything; a form like Arabic's `zero` may spell
          // the count out in words, but never invents a placeholder.
          expect(placeholders(forms.other), label).toEqual(expected);
          for (const form of Object.values(forms)) {
            for (const name of placeholders(form)) expect(expected, label).toContain(name);
          }
        }
      }
    }
  });

  it("names every month", () => {
    for (const locale of LOCALES) {
      expect(ADMIN_MESSAGES[locale].discountFormat.months, locale).toHaveLength(12);
    }
  });

  it("gives Bosnian, Russian and Arabic their plural forms", () => {
    const { bs, ru, ar } = ADMIN_MESSAGES;
    expect(plural("bs", 3, bs.liveOrders.newOrders)).not.toBe(plural("bs", 5, bs.liveOrders.newOrders).replace("5", "3"));
    expect(plural("ru", 5, ru.liveOrders.newOrders)).toMatch(/^5 /);
    expect(plural("ru", 2, ru.liveOrders.newOrders)).not.toBe(plural("ru", 5, ru.liveOrders.newOrders).replace("5", "2"));
    expect(plural("ar", 3, ar.liveOrders.newOrders)).toMatch(/3/);
  });
});

describe("theme section copy", () => {
  // The English in each section's schema is what `en.themeSections` lays over
  // it, word for word — so editing one without the other fails here.
  const schemaWords = (fields: Fields) =>
    Object.fromEntries(
      Object.entries(fields).map(([key, field]) => {
        const words: Record<string, unknown> = { label: field.label };
        if (field.help !== undefined) words.help = field.help;
        if ((field.kind === "text" || field.kind === "textarea") && field.placeholder !== undefined) {
          words.placeholder = field.placeholder;
        }
        if (field.kind === "color" && field.nullLabel !== undefined) words.nullLabel = field.nullLabel;
        if (field.kind === "select" && key !== "headingFont" && key !== "bodyFont") {
          words.options = Object.fromEntries(field.options.map((option) => [option.value, option.label]));
        }
        return [key, words];
      }),
    );

  it("matches every section schema in English", () => {
    const copy = ADMIN_MESSAGES.en.themeSections as Record<string, unknown>;
    for (const manifest of sectionManifests()) {
      const expected: Record<string, unknown> = {
        name: manifest.name,
        description: manifest.description,
        settings: schemaWords(manifest.settings),
      };
      if (Object.keys(manifest.blocks).length > 0) {
        expected.blocks = Object.fromEntries(
          Object.entries(manifest.blocks).map(([type, block]) => [
            type,
            { name: block.name, settings: schemaWords(block.settings) },
          ]),
        );
      }
      expect(copy[manifest.type], manifest.type).toEqual(expected);
    }
    expect(Object.keys(copy).sort()).toEqual(sectionManifests().map((m) => m.type).sort());
  });

  it("matches the theme settings in English", () => {
    expect(ADMIN_MESSAGES.en.themeSettings).toEqual(schemaWords(THEME_SETTINGS));
  });

  it("translates the editor's labels without changing what is stored", () => {
    const german = sectionManifests(ADMIN_MESSAGES.de.themeSections);
    const english = sectionManifests();
    const hero = german.find((manifest) => manifest.type === "hero")!;
    expect(hero.name).toBe(ADMIN_MESSAGES.de.themeSections.hero.name);
    expect(Object.keys(hero.settings)).toEqual(
      Object.keys(english.find((manifest) => manifest.type === "hero")!.settings),
    );
    expect(hero.settings.heading).toMatchObject({ kind: "text", maxLength: 80 });
  });
});
