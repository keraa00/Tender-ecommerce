import * as z from "zod";

import { ProductStatus } from "@/lib/db/types";
import { parseMoneyToCents } from "@/lib/money";
import { resourceSlugSchema, slugify } from "@/lib/slug";
import { MAX_WEIGHT_GRAMS, parseWeightToGrams } from "@/lib/weight";
import { MAX_VARIANTS } from "./constants";

/**
 * Parsing and validation for the product form, kept free of `server-only` and
 * of any database access so the rules can be unit-tested directly.
 *
 * Variants and images arrive as *parallel repeated fields* rather than indexed
 * names: `formData.getAll("variantTitle")` preserves document order, so row `n`
 * of one field lines up with row `n` of the others. That keeps the form working
 * without JavaScript, where a client-maintained index would not survive.
 */

export { MAX_VARIANTS };
const MAX_TITLE = 140;
const MAX_DESCRIPTION = 2_000;
const MAX_VARIANT_TITLE = 80;
const MAX_SKU = 60;
/** Well above any real price, but low enough to stay clear of overflow. */
const MAX_PRICE_CENTS = 100_000_000;
const MAX_INVENTORY = 1_000_000;

export type VariantDraft = {
  /** Present when the row edits an existing variant; null when it is new. */
  id: string | null;
  title: string;
  sku: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  inventoryQty: number;
  /** Typed in kilograms; blank is 0. */
  weightGrams: number;
};

export type ProductDraft = {
  title: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  /** False for digital products and services — see the Product model. */
  requiresShipping: boolean;
  variants: VariantDraft[];
};

export type ProductFieldErrors = {
  title?: string;
  slug?: string;
  description?: string;
  status?: string;
  /** Applies to the variant list as a whole. */
  variants?: string;
  /** Keyed by row index, so the form can mark the offending row. */
  variantRows?: Record<number, string>;
};

export type ParsedProductForm =
  | { ok: true; draft: ProductDraft }
  | { ok: false; fieldErrors: ProductFieldErrors };

const productSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the product a title.")
    .max(MAX_TITLE, `Keep the title under ${MAX_TITLE} characters.`),
  slug: resourceSlugSchema,
  description: z
    .string()
    .trim()
    .max(MAX_DESCRIPTION, `Keep the description under ${MAX_DESCRIPTION} characters.`)
    .optional(),
  status: z.enum([
    ProductStatus.DRAFT,
    ProductStatus.ACTIVE,
    ProductStatus.ARCHIVED,
  ]),
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function column(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((v) => (typeof v === "string" ? v : ""));
}

/** A row the seller left entirely blank is dropped rather than rejected. */
function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function parseInventory(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return value > MAX_INVENTORY ? null : value;
}

export function parseProductForm(formData: FormData): ParsedProductForm {
  const rawTitle = field(formData, "title");
  const rawSlug = field(formData, "slug");
  const rawDescription = field(formData, "description");

  const parsed = productSchema.safeParse({
    title: rawTitle,
    // A blank address means "derive it from the title", which is what the form
    // does client-side anyway; this is the no-JavaScript fallback.
    slug: rawSlug.trim() === "" ? slugify(rawTitle) : rawSlug,
    description: rawDescription.trim() === "" ? undefined : rawDescription,
    status: field(formData, "status") || ProductStatus.DRAFT,
  });

  const fieldErrors: ProductFieldErrors = {};

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    fieldErrors.title = flattened.title?.[0];
    fieldErrors.slug = flattened.slug?.[0];
    fieldErrors.description = flattened.description?.[0];
    fieldErrors.status = flattened.status?.[0];

    // A blank title derives a blank slug, so both fail together. Reporting the
    // slug too reads as two problems when the seller has one thing to fix.
    if (fieldErrors.title && rawSlug.trim() === "") {
      delete fieldErrors.slug;
    }
  }

  const ids = column(formData, "variantId");
  const titles = column(formData, "variantTitle");
  const skus = column(formData, "variantSku");
  const prices = column(formData, "variantPrice");
  const compareAts = column(formData, "variantCompareAt");
  const stocks = column(formData, "variantStock");
  const weights = column(formData, "variantWeight");

  const variants: VariantDraft[] = [];
  const variantRows: Record<number, string> = {};

  for (let row = 0; row < titles.length; row += 1) {
    const title = titles[row] ?? "";
    const sku = skus[row] ?? "";
    const price = prices[row] ?? "";
    const compareAt = compareAts[row] ?? "";
    const stock = stocks[row] ?? "";

    if (isBlankRow([title, sku, price, compareAt, stock])) continue;

    if (title.trim() === "") {
      variantRows[row] = "Name this option.";
      continue;
    }
    if (title.trim().length > MAX_VARIANT_TITLE) {
      variantRows[row] = `Keep the name under ${MAX_VARIANT_TITLE} characters.`;
      continue;
    }
    if (sku.trim().length > MAX_SKU) {
      variantRows[row] = `Keep the SKU under ${MAX_SKU} characters.`;
      continue;
    }

    const priceCents = parseMoneyToCents(price);
    if (priceCents === null) {
      variantRows[row] = "Enter a price like 24.99.";
      continue;
    }
    if (priceCents > MAX_PRICE_CENTS) {
      variantRows[row] = "That price is too large.";
      continue;
    }

    let compareAtPriceCents: number | null = null;
    if (compareAt.trim() !== "") {
      compareAtPriceCents = parseMoneyToCents(compareAt);
      if (compareAtPriceCents === null || compareAtPriceCents > MAX_PRICE_CENTS) {
        variantRows[row] = "Enter a compare-at price like 29.99.";
        continue;
      }
      // A compare-at below the price would render as a discount to a higher
      // number, which reads as an error to the buyer.
      if (compareAtPriceCents <= priceCents) {
        variantRows[row] = "Compare-at must be higher than the price.";
        continue;
      }
    }

    const inventoryQty = parseInventory(stock);
    if (inventoryQty === null) {
      variantRows[row] = "Stock must be a whole number, 0 or more.";
      continue;
    }

    const weight = (weights[row] ?? "").trim();
    const weightGrams = weight === "" ? 0 : parseWeightToGrams(weight);
    if (weightGrams === null || weightGrams > MAX_WEIGHT_GRAMS) {
      variantRows[row] = "Enter the weight in kilograms, like 0.35.";
      continue;
    }

    const id = (ids[row] ?? "").trim();

    variants.push({
      id: id === "" ? null : id,
      title: title.trim(),
      sku: sku.trim() === "" ? null : sku.trim(),
      priceCents,
      compareAtPriceCents,
      inventoryQty,
      weightGrams,
    });
  }

  if (Object.keys(variantRows).length > 0) {
    fieldErrors.variantRows = variantRows;
  }

  if (variants.length === 0 && Object.keys(variantRows).length === 0) {
    // Without a variant there is no price, and nothing for a buyer to add to a
    // cart — so a product with none is not a saveable state.
    fieldErrors.variants = "Add at least one option with a price.";
  }

  if (variants.length > MAX_VARIANTS) {
    fieldErrors.variants = `A product can have at most ${MAX_VARIANTS} options.`;
  }

  const duplicateSku = findDuplicateSku(variants);
  if (duplicateSku) {
    fieldErrors.variants = `SKU "${duplicateSku}" is used on more than one option.`;
  }

  if (Object.values(fieldErrors).some((value) => value !== undefined)) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    draft: {
      title: parsed.success ? parsed.data.title : rawTitle.trim(),
      slug: parsed.success ? parsed.data.slug : "",
      description: parsed.success ? (parsed.data.description ?? null) : null,
      status: parsed.success ? parsed.data.status : ProductStatus.DRAFT,
      // A checkbox: present when ticked. The form always carries it.
      requiresShipping: formData.get("requiresShipping") !== null,
      variants,
    },
  };
}

/**
 * SKUs are unique per store at the database level, so a repeat inside one form
 * would surface as an opaque constraint violation rather than a field error.
 */
function findDuplicateSku(variants: VariantDraft[]): string | null {
  const seen = new Set<string>();

  for (const variant of variants) {
    if (variant.sku === null) continue;
    const key = variant.sku.toLowerCase();
    if (seen.has(key)) return variant.sku;
    seen.add(key);
  }

  return null;
}
