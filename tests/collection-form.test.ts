import { describe, expect, it } from "vitest";

import {
  MAX_COLLECTION_PRODUCTS,
  parseCollectionForm as parseWith,
} from "@/lib/collections/form";
import { en } from "@/lib/i18n/admin/en";

const parseCollectionForm = (formData: FormData) => parseWith(formData, en);

function form(
  fields: Partial<{ title: string; slug: string; description: string }>,
  productIds: string[] = [],
) {
  const data = new FormData();
  data.set("title", fields.title ?? "Summer essentials");
  data.set("slug", fields.slug ?? "");
  data.set("description", fields.description ?? "");
  for (const id of productIds) data.append("productId", id);
  return data;
}

describe("parseCollectionForm", () => {
  it("derives the address from the title when left blank", () => {
    const result = parseCollectionForm(form({ title: "Gifts under €30" }));
    expect(result).toEqual({
      ok: true,
      draft: {
        title: "Gifts under €30",
        slug: "gifts-under-30",
        description: null,
        productIds: [],
      },
    });
  });

  it("keeps product order and drops repeats", () => {
    const result = parseCollectionForm(form({}, ["b", "a", "b", " ", "c"]));
    expect(result.ok && result.draft.productIds).toEqual(["b", "a", "c"]);
  });

  it("reports a blank title once, not as a title and a slug error", () => {
    const result = parseCollectionForm(form({ title: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.title).toBeDefined();
    expect(result.fieldErrors.slug).toBeUndefined();
  });

  it("rejects a malformed address the seller typed", () => {
    const result = parseCollectionForm(form({ slug: "Not a slug!" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.slug).toBeDefined();
  });

  it("caps the number of products", () => {
    const ids = Array.from({ length: MAX_COLLECTION_PRODUCTS + 1 }, (_, i) => `p${i}`);
    const result = parseCollectionForm(form({}, ids));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.products).toBeDefined();
  });
});
