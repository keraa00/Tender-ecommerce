import * as z from "zod";

import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { resourceSlugSchema, slugify } from "@/lib/slug";

/**
 * Parsing and validation for the collection form. Free of `server-only` and of
 * database access so it can be unit-tested directly — which products the ids
 * actually belong to is checked by the action, not here.
 */

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2_000;
export const MAX_COLLECTION_PRODUCTS = 500;

export type CollectionDraft = {
  title: string;
  slug: string;
  description: string | null;
  /** In the order the seller listed them, de-duplicated. */
  productIds: string[];
};

export type CollectionFieldErrors = {
  title?: string;
  slug?: string;
  description?: string;
  products?: string;
};

export type ParsedCollectionForm =
  | { ok: true; draft: CollectionDraft }
  | { ok: false; fieldErrors: CollectionFieldErrors };

function collectionSchema(t: AdminMessages) {
  const errors = t.collections.errors;
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, errors.titleRequired)
      .max(MAX_TITLE, format(errors.titleTooLong, { max: MAX_TITLE })),
    slug: resourceSlugSchema(t.validation.slug),
    description: z
      .string()
      .trim()
      .max(MAX_DESCRIPTION, format(errors.descriptionTooLong, { max: MAX_DESCRIPTION }))
      .optional(),
  });
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** `t` is the admin's copy in the seller's language, which the errors are said in. */
export function parseCollectionForm(formData: FormData, t: AdminMessages): ParsedCollectionForm {
  const rawTitle = field(formData, "title");
  const rawSlug = field(formData, "slug");
  const rawDescription = field(formData, "description");

  const parsed = collectionSchema(t).safeParse({
    title: rawTitle,
    slug: rawSlug.trim() === "" ? slugify(rawTitle) : rawSlug,
    description: rawDescription.trim() === "" ? undefined : rawDescription,
  });

  const productIds = [
    ...new Set(
      formData
        .getAll("productId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  const fieldErrors: CollectionFieldErrors = {};

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    fieldErrors.title = flattened.title?.[0];
    fieldErrors.slug = flattened.slug?.[0];
    fieldErrors.description = flattened.description?.[0];

    // Same reasoning as the product form: a blank title derives a blank slug,
    // and that is one problem for the seller, not two.
    if (fieldErrors.title && rawSlug.trim() === "") delete fieldErrors.slug;
  }

  if (productIds.length > MAX_COLLECTION_PRODUCTS) {
    fieldErrors.products = format(t.collections.errors.tooManyProducts, {
      max: MAX_COLLECTION_PRODUCTS,
    });
  }

  if (!parsed.success || fieldErrors.products) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    draft: {
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      productIds,
    },
  };
}
