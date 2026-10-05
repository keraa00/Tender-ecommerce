import { describe, expect, it } from "vitest";

import {
  MAX_LOGO_BYTES,
  logoRejectionReason,
  markTextColor,
  storeInitials,
} from "@/lib/stores/logo";

describe("storeInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(storeInitials("Kerim test store")).toBe("KT");
    expect(storeInitials("second test store")).toBe("ST");
    expect(storeInitials("Rosewater Ceramics")).toBe("RC");
  });

  it("uses one letter for a one-word name", () => {
    expect(storeInitials("Rosewater")).toBe("R");
  });

  it("ignores extra whitespace", () => {
    expect(storeInitials("  Nordhavn   Supply  ")).toBe("NS");
  });

  it("reads past punctuation and skips words without letters", () => {
    expect(storeInitials("Bob's Bikes & Parts")).toBe("BB");
    expect(storeInitials("“Quiet” Goods")).toBe("QG");
    expect(storeInitials("☕ Daily Grind")).toBe("DG");
  });

  it("counts digits as letters", () => {
    expect(storeInitials("7th Street Records")).toBe("7S");
  });

  it("keeps accents, including ones written as combining marks", () => {
    expect(storeInitials("élan olive")).toBe("ÉO");
    expect(storeInitials("élan olive")).toBe("ÉO");
  });

  it("handles scripts without case", () => {
    expect(storeInitials("متجر الورد")).toBe("ما");
  });

  it("falls back to the first character when there are no letters", () => {
    expect(storeInitials("☕☕")).toBe("☕");
    expect(storeInitials("")).toBe("");
  });
});

describe("markTextColor", () => {
  it("puts white on dark accents", () => {
    expect(markTextColor("#14504f")).toBe("#ffffff");
    expect(markTextColor("#b4552d")).toBe("#ffffff");
    expect(markTextColor("#1d4ed8")).toBe("#ffffff");
  });

  it("puts near-black on light accents", () => {
    expect(markTextColor("#fde68a")).toBe("#0c0a09");
    expect(markTextColor("#ffffff")).toBe("#0c0a09");
  });

  it("reads three-digit hex", () => {
    expect(markTextColor("#000")).toBe("#ffffff");
    expect(markTextColor("#ff0")).toBe("#0c0a09");
  });

  it("falls back to white for anything that is not hex", () => {
    expect(markTextColor("rebeccapurple")).toBe("#ffffff");
    expect(markTextColor("var(--primary)")).toBe("#ffffff");
  });
});

describe("logoRejectionReason", () => {
  it("accepts the image types the bucket takes", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/avif"]) {
      expect(logoRejectionReason({ type, size: 40_000 })).toBeNull();
    }
  });

  it("refuses other types, SVG included", () => {
    expect(logoRejectionReason({ type: "image/svg+xml", size: 2_000 })).not.toBeNull();
    expect(logoRejectionReason({ type: "image/gif", size: 2_000 })).not.toBeNull();
  });

  it("refuses empty files and files over the limit", () => {
    expect(logoRejectionReason({ type: "image/png", size: 0 })).not.toBeNull();
    expect(logoRejectionReason({ type: "image/png", size: MAX_LOGO_BYTES })).toBeNull();
    expect(logoRejectionReason({ type: "image/png", size: MAX_LOGO_BYTES + 1 })).not.toBeNull();
  });
});
