import { describe, expect, it } from "vitest";

import { foldTopProducts } from "@/lib/analytics/top-products";

describe("foldTopProducts", () => {
  it("takes each line's discount off what the title earned", () => {
    expect(
      foldTopProducts(
        [{ titleSnapshot: "Mug", unitPriceCents: 2_000, quantity: 3, discountCents: 1_200 }],
        5,
      ),
    ).toEqual([{ title: "Mug", units: 3, revenueCents: 4_800 }]);
  });

  it("folds every price a title sold at into one row", () => {
    expect(
      foldTopProducts(
        [
          { titleSnapshot: "Mug", unitPriceCents: 2_000, quantity: 2, discountCents: 0 },
          { titleSnapshot: "Mug", unitPriceCents: 1_500, quantity: 1, discountCents: 300 },
        ],
        5,
      ),
    ).toEqual([{ title: "Mug", units: 3, revenueCents: 5_200 }]);
  });

  it("ranks by revenue after discounts and keeps the top ones", () => {
    const top = foldTopProducts(
      [
        // Lists higher but sold mostly at a discount.
        { titleSnapshot: "Bowl", unitPriceCents: 5_000, quantity: 2, discountCents: 6_000 },
        { titleSnapshot: "Plate", unitPriceCents: 3_000, quantity: 2, discountCents: 0 },
        { titleSnapshot: "Cup", unitPriceCents: 500, quantity: 1, discountCents: 0 },
      ],
      2,
    );
    expect(top.map((product) => product.title)).toEqual(["Plate", "Bowl"]);
  });
});
