import { describe, expect, it } from "vitest";

import { LOCALES, localeDirection, resolveLocale } from "@/lib/i18n/locales";
import { format, MESSAGES, plural } from "@/lib/i18n/messages";

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
