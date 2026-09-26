import { describe, expect, it } from "vitest";

import { LOCALES, resolveLocale } from "@/lib/i18n/locales";
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

  it("falls back to `other` for categories a language does not define", () => {
    expect(plural("en", 2, MESSAGES.en.catalog.productCount)).toBe("2 products");
    expect(plural("es", 1_000_000, MESSAGES.es.catalog.productCount)).toMatch(/productos$/);
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(format("Hi {name}, {missing}", { name: "Ana" })).toBe("Hi Ana, {missing}");
  });

  it("resolves an unrecognised cookie to English", () => {
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });
});
