import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/admin/en";
import { RESERVED_STORE_SLUGS, slugify, storeSlugSchema as schemaIn } from "@/lib/slug";

const storeSlugSchema = schemaIn(en.validation.slug);

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Rosewater Ceramics")).toBe("rosewater-ceramics");
    expect(slugify("  Nordhavn   Supply  ")).toBe("nordhavn-supply");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("Bob's Bikes & Parts!!")).toBe("bob-s-bikes-parts");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("strips diacritics rather than dropping the letters", () => {
    expect(slugify("Café Olívia")).toBe("cafe-olivia");
  });

  it("never leaves a leading or trailing hyphen", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("!!!")).toBe("");
  });

  it("produces output the schema accepts", () => {
    for (const input of ["Rosewater Ceramics", "Bob's Bikes", "Café Olívia"]) {
      expect(storeSlugSchema.safeParse(slugify(input)).success).toBe(true);
    }
  });
});

describe("storeSlugSchema", () => {
  it("accepts lowercase alphanumeric with single hyphens", () => {
    for (const slug of ["abc", "nordhavn-supply", "store-2026", "a1-b2-c3"]) {
      expect(storeSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it("rejects malformed slugs", () => {
    for (const slug of [
      "ab", // too short
      "-leading",
      "trailing-",
      "double--hyphen",
      "has space",
      "under_score",
      "emoji-🙂",
      "a".repeat(41), // too long
    ]) {
      expect(storeSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("rejects reserved slugs", () => {
    for (const slug of ["admin", "api", "dashboard", "checkout"]) {
      expect(RESERVED_STORE_SLUGS.has(slug)).toBe(true);
      expect(storeSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("normalises case and surrounding whitespace before validating", () => {
    const parsed = storeSlugSchema.safeParse("  Nordhavn-Supply  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("nordhavn-supply");
  });
});
