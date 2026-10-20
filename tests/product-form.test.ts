import { describe, expect, it } from "vitest";

import { parseProductForm } from "@/lib/products/form";

type Row = Partial<{
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  weight: string;
}>;

function form(
  fields: Partial<{
    title: string;
    slug: string;
    description: string;
    status: string;
    requiresShipping: boolean;
  }>,
  rows: Row[] = [{ title: "Default", price: "24.99", stock: "3" }],
) {
  const data = new FormData();
  data.set("title", fields.title ?? "Stoneware mug");
  data.set("slug", fields.slug ?? "");
  data.set("description", fields.description ?? "");
  if (fields.status !== undefined) data.set("status", fields.status);
  if (fields.requiresShipping ?? true) data.set("requiresShipping", "on");

  for (const row of rows) {
    data.append("variantId", row.id ?? "");
    data.append("variantTitle", row.title ?? "");
    data.append("variantSku", row.sku ?? "");
    data.append("variantPrice", row.price ?? "");
    data.append("variantCompareAt", row.compareAt ?? "");
    data.append("variantStock", row.stock ?? "");
    data.append("variantWeight", row.weight ?? "");
  }

  return data;
}

describe("parseProductForm", () => {
  it("accepts a minimal product and derives the slug from the title", () => {
    const parsed = parseProductForm(form({ title: "Stoneware Mug" }));

    expect(parsed).toMatchObject({
      ok: true,
      draft: {
        title: "Stoneware Mug",
        slug: "stoneware-mug",
        description: null,
        status: "DRAFT",
      },
    });
  });

  it("keeps an explicit slug over the derived one", () => {
    const parsed = parseProductForm(
      form({ title: "Stoneware Mug", slug: "the-mug" }),
    );

    expect(parsed).toMatchObject({ ok: true, draft: { slug: "the-mug" } });
  });

  it("reads prices as integer cents", () => {
    const parsed = parseProductForm(
      form({}, [{ title: "Small", price: "$24.99", stock: "2" }]),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draft: { variants: [{ priceCents: 2499, inventoryQty: 2 }] },
    });
  });

  it("defaults blank stock to zero", () => {
    const parsed = parseProductForm(
      form({}, [{ title: "Small", price: "5.00", stock: "" }]),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draft: { variants: [{ inventoryQty: 0 }] },
    });
  });

  it("carries a variant id through so an edit updates rather than replaces", () => {
    const parsed = parseProductForm(
      form({}, [{ id: "v1", title: "Small", price: "5.00", stock: "1" }]),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draft: { variants: [{ id: "v1" }] },
    });
  });

  it("treats a row with no id as new", () => {
    const parsed = parseProductForm(
      form({}, [{ title: "Small", price: "5.00", stock: "1" }]),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draft: { variants: [{ id: null }] },
    });
  });

  it("drops a completely blank row instead of rejecting it", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", price: "5.00", stock: "1" },
        {},
      ]),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.draft.variants).toHaveLength(1);
  });

  it("requires a title", () => {
    const parsed = parseProductForm(form({ title: "  " }));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors.title).toBeDefined();
  });

  it("does not also complain about the slug when the title is what is missing", () => {
    const parsed = parseProductForm(form({ title: "" }));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors.slug).toBeUndefined();
  });

  it("requires at least one priced option", () => {
    const parsed = parseProductForm(form({}, [{}]));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors.variants).toBeDefined();
  });

  it("reports a bad price against its own row", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", price: "5.00", stock: "1" },
        { title: "Large", price: "not a price", stock: "1" },
      ]),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.fieldErrors.variantRows?.[1]).toBeDefined();
      expect(parsed.fieldErrors.variantRows?.[0]).toBeUndefined();
    }
  });

  it("rejects a negative price rather than reading it as positive", () => {
    const parsed = parseProductForm(
      form({}, [{ title: "Small", price: "-5.00", stock: "1" }]),
    );

    expect(parsed.ok).toBe(false);
  });

  it("rejects fractional or negative stock", () => {
    for (const stock of ["1.5", "-2", "two"]) {
      const parsed = parseProductForm(
        form({}, [{ title: "Small", price: "5.00", stock }]),
      );
      expect(parsed.ok, `stock ${stock}`).toBe(false);
    }
  });

  it("requires compare-at to sit above the price", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", price: "20.00", compareAt: "15.00", stock: "1" },
      ]),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors.variantRows?.[0]).toContain("higher");
  });

  it("accepts a compare-at above the price", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", price: "20.00", compareAt: "25.00", stock: "1" },
      ]),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draft: { variants: [{ compareAtPriceCents: 2500 }] },
    });
  });

  it("catches a SKU repeated across two options before the database does", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", sku: "MUG-1", price: "5.00", stock: "1" },
        { title: "Large", sku: "mug-1", price: "7.00", stock: "1" },
      ]),
    );

    expect(parsed.ok).toBe(false);
    // Matched case-insensitively, and reported as typed on the offending row.
    if (!parsed.ok) expect(parsed.fieldErrors.variants).toMatch(/mug-1/i);
  });

  it("allows several options to have no SKU at all", () => {
    const parsed = parseProductForm(
      form({}, [
        { title: "Small", price: "5.00", stock: "1" },
        { title: "Large", price: "7.00", stock: "1" },
      ]),
    );

    expect(parsed.ok).toBe(true);
  });

  it("only accepts the three real statuses", () => {
    expect(parseProductForm(form({ status: "ACTIVE" })).ok).toBe(true);
    expect(parseProductForm(form({ status: "PUBLISHED" })).ok).toBe(false);
  });
});

describe("shipping fields", () => {
  it("reads each option's weight in kilograms as grams, blank as 0", () => {
    const result = parseProductForm(
      form({}, [
        { title: "Small", price: "10", weight: "0.35" },
        { title: "Large", price: "12", weight: "1,2 kg" },
        { title: "Gift card", price: "25" },
      ]),
    );
    expect(result.ok && result.draft.variants.map((variant) => variant.weightGrams)).toEqual([
      350, 1200, 0,
    ]);
  });

  it("rejects a weight that is not a number of kilograms, on its row", () => {
    const result = parseProductForm(form({}, [{ title: "Default", price: "10", weight: "heavy" }]));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { variantRows: { 0: "Enter the weight in kilograms, like 0.35." } },
    });
  });

  it("treats an unticked box as a product that ships nothing", () => {
    const physical = parseProductForm(form({}));
    const digital = parseProductForm(form({ requiresShipping: false }));
    expect(physical.ok && physical.draft.requiresShipping).toBe(true);
    expect(digital.ok && digital.draft.requiresShipping).toBe(false);
  });
});
