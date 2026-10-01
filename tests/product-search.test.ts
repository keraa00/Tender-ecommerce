import { describe, expect, it } from "vitest";

import {
  matchRanges,
  normalizeSearchQuery,
  rankByTitle,
  searchTerms,
  titleMatchRank,
} from "@/lib/products/search";

const titles = (list: { title: string }[]) => list.map((p) => p.title);

describe("searchTerms", () => {
  it("splits on whitespace, lower-cases, and drops repeats", () => {
    expect(searchTerms("  Red   SHIRT red ")).toEqual(["red", "shirt"]);
  });

  it("is empty for a blank query", () => {
    expect(searchTerms("   ")).toEqual([]);
  });

  it("caps the query length and the number of words", () => {
    expect(normalizeSearchQuery("x".repeat(150))).toHaveLength(100);
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
  });
});

describe("titleMatchRank", () => {
  it("puts the exact title first, then titles starting with the query", () => {
    expect(titleMatchRank("Mug", ["mug"])).toBe(0);
    expect(titleMatchRank("Mug set", ["mug"])).toBe(1);
  });

  it("prefers words that start with the query over matches mid-word", () => {
    expect(titleMatchRank("Linen shirt", ["sh"])).toBe(2);
    expect(titleMatchRank("Mushroom lamp", ["sh"])).toBe(3);
  });

  it("matches every word in any order", () => {
    expect(titleMatchRank("Red cotton shirt", ["shirt", "red"])).toBe(2);
  });

  it("ranks description-only matches last", () => {
    expect(titleMatchRank("Linen shirt", ["cotton"])).toBe(4);
    expect(titleMatchRank("Red mug", ["red", "cotton"])).toBe(4);
  });

  it("treats punctuation as a word boundary, in any script", () => {
    expect(titleMatchRank("Tea-cup", ["cup"])).toBe(2);
    expect(titleMatchRank("Šolja za čaj", ["čaj"])).toBe(2);
  });
});

describe("rankByTitle", () => {
  it("orders best matches first and keeps ties in their incoming order", () => {
    const products = [
      { title: "Mushroom lamp" },
      { title: "Linen shirt" },
      { title: "Shirt" },
      { title: "Shirt dress" },
      { title: "Short shirt" },
    ];
    expect(titles(rankByTitle(products, ["shirt"]))).toEqual([
      "Shirt",
      "Shirt dress",
      "Linen shirt",
      "Short shirt",
      "Mushroom lamp",
    ]);
  });

  it("does not mutate its input", () => {
    const products = [{ title: "B" }, { title: "A" }];
    rankByTitle(products, ["a"]);
    expect(titles(products)).toEqual(["B", "A"]);
  });
});

describe("matchRanges", () => {
  it("marks every word a term starts, case-insensitively", () => {
    expect(matchRanges("Red Shirt, red", ["red"])).toEqual([
      [0, 3],
      [11, 14],
    ]);
  });

  it("skips mid-word hits when a term also starts a word", () => {
    expect(matchRanges("Enamel Camp Mug", ["m"])).toEqual([[12, 13]]);
  });

  it("falls back to the first hit when a term never starts a word", () => {
    expect(matchRanges("Alpine Headlamp", ["am"])).toEqual([[12, 14]]);
    expect(matchRanges("Mushroom lamp", ["shirt"])).toEqual([]);
  });

  it("merges overlapping and touching matches", () => {
    expect(matchRanges("Teapot", ["tea", "eap", "pot"])).toEqual([[0, 6]]);
  });

  it("gives up rather than misplace a highlight when case-folding shifts offsets", () => {
    expect(matchRanges("İstanbul mug", ["mug"])).toEqual([]);
  });
});
