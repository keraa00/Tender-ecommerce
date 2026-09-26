import { describe, expect, it } from "vitest";

import { parseCatalogSort, sortProducts } from "@/lib/products/sort";

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

const products = [
  { title: "Mug", createdAt: at(1), variants: [{ priceCents: 2400 }], position: 2 },
  { title: "Bowl", createdAt: at(3), variants: [{ priceCents: 3200 }, { priceCents: 1800 }], position: 0 },
  { title: "Vase", createdAt: at(2), variants: [], position: 1 },
  { title: "Plate", createdAt: at(4), variants: [{ priceCents: 5000 }], position: 3 },
];

const titles = (list: { title: string }[]) => list.map((p) => p.title);

describe("sortProducts", () => {
  it("orders newest first", () => {
    expect(titles(sortProducts(products, "newest"))).toEqual(["Plate", "Bowl", "Vase", "Mug"]);
  });

  it("orders by cheapest option, with unpriced products last", () => {
    expect(titles(sortProducts(products, "price-asc"))).toEqual(["Bowl", "Mug", "Plate", "Vase"]);
    expect(titles(sortProducts(products, "price-desc"))).toEqual(["Plate", "Mug", "Bowl", "Vase"]);
  });

  it("follows the seller's collection order for featured", () => {
    expect(titles(sortProducts(products, "featured"))).toEqual(["Bowl", "Vase", "Mug", "Plate"]);
  });

  it("orders by title", () => {
    expect(titles(sortProducts(products, "title"))).toEqual(["Bowl", "Mug", "Plate", "Vase"]);
  });

  it("does not mutate its input", () => {
    const before = titles(products);
    sortProducts(products, "title");
    expect(titles(products)).toEqual(before);
  });
});

describe("parseCatalogSort", () => {
  it("accepts known values and falls back otherwise", () => {
    expect(parseCatalogSort("price-asc")).toBe("price-asc");
    expect(parseCatalogSort("drop table")).toBe("newest");
    expect(parseCatalogSort(["price-asc"])).toBe("newest");
    expect(parseCatalogSort(undefined, "featured")).toBe("featured");
  });
});
