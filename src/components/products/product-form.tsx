"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";

import { SaveBar, useDiscard } from "@/components/admin/save-bar";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Label, Textarea } from "@/components/ui/field";
import { shrinkImage } from "@/lib/images/shrink-image";
import { centsToInputValue } from "@/lib/money";
import { gramsToInputValue } from "@/lib/weight";
import type { ProductFormState } from "@/lib/products/actions";
import {
  IMAGE_ACCEPT_ATTRIBUTE,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_UPLOAD,
  MAX_SOURCE_IMAGE_MB,
  MAX_VARIANTS,
  PRODUCT_IMAGE_MAX_EDGE,
  PRODUCT_STATUS_OPTIONS,
  sourceImageRejectionReason,
} from "@/lib/products/constants";
import { slugify } from "@/lib/slug";

/**
 * Variants and images post as parallel repeated fields (`variantTitle` ×N and
 * so on) rather than indexed names, which is what lets `formData.getAll()` on
 * the server line the columns up by position. See `lib/products/form.ts`.
 */

type ExistingImage = { id: string; url: string; altText: string | null };

/** A chosen file shown before it is uploaded. `url` is a `blob:` object URL. */
type PendingImage = { url: string; name: string };

type ExistingVariant = {
  id: string;
  title: string;
  sku: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  inventoryQty: number;
  weightGrams: number;
};

export type ProductFormProduct = {
  title: string;
  slug: string;
  description: string | null;
  status: string;
  requiresShipping: boolean;
  images: ExistingImage[];
  variants: ExistingVariant[];
  collectionIds: string[];
};

export type ProductFormCollection = { id: string; title: string };

type VariantRow = {
  /** Stable React key. Not submitted — `id` is what the server matches on. */
  key: string;
  id: string | null;
  title: string;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  /** Kilograms, as typed. */
  weight: string;
};

let rowCounter = 0;
function nextKey() {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function blankRow(): VariantRow {
  return {
    key: nextKey(),
    id: null,
    title: "",
    sku: "",
    price: "",
    compareAt: "",
    stock: "0",
    weight: "",
  };
}

function rowsFrom(product?: ProductFormProduct): VariantRow[] {
  if (!product || product.variants.length === 0) {
    return [{ ...blankRow(), title: "Default" }];
  }

  return product.variants.map((variant) => ({
    key: nextKey(),
    id: variant.id,
    title: variant.title,
    sku: variant.sku ?? "",
    price: centsToInputValue(variant.priceCents),
    compareAt:
      variant.compareAtPriceCents === null
        ? ""
        : centsToInputValue(variant.compareAtPriceCents),
    stock: String(variant.inventoryQty),
    weight: variant.weightGrams === 0 ? "" : gramsToInputValue(variant.weightGrams),
  }));
}

type ProductFormProps = {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  product?: ProductFormProduct;
  /** Every collection in the store, for the picker. */
  collections?: ProductFormCollection[];
  submitLabel: string;
};

export function ProductForm(props: ProductFormProps) {
  const { key, discard } = useDiscard();
  return <ProductFormBody key={key} {...props} onDiscard={discard} />;
}

function ProductFormBody({
  action,
  product,
  collections = [],
  submitLabel,
  onDiscard,
}: ProductFormProps & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    {},
  );

  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  // Once the seller edits the address, stop rewriting it from the title.
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [rows, setRows] = useState<VariantRow[]>(() => rowsFrom(product));
  const [requiresShipping, setRequiresShipping] = useState(product?.requiresShipping ?? true);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  // The chosen photos scaled down to fit the save request, which is what is
  // actually sent. Each new choice starts a new run; a slower, older one that
  // finishes afterwards is dropped.
  const [preparedImages, setPreparedImages] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const prepareRun = useRef(0);

  // Object URLs hold the file in memory until revoked, so each batch is
  // released as soon as it is replaced, cleared or the form unmounts.
  useEffect(
    () => () => {
      for (const image of pendingImages) URL.revokeObjectURL(image.url);
    },
    [pendingImages],
  );

  const existingImages = product?.images ?? [];
  const effectiveSlug = slugEdited ? slug : slugify(title);
  const rowErrors = state.fieldErrors?.variantRows ?? {};

  function updateRow(key: string, patch: Partial<VariantRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function prepareImages(files: File[]) {
    const run = ++prepareRun.current;
    setPreparedImages([]);
    setPreparing(files.length > 0);
    if (files.length === 0) return;

    try {
      const prepared: File[] = [];
      // One at a time: a decoded phone photo is tens of megabytes.
      for (const file of files) {
        prepared.push(
          await shrinkImage(file, {
            maxEdge: PRODUCT_IMAGE_MAX_EDGE,
            maxBytes: MAX_IMAGE_BYTES,
            baseName: "product-photo",
          }),
        );
        if (run !== prepareRun.current) return;
      }
      setPreparedImages(prepared);
    } catch (problem) {
      if (run !== prepareRun.current) return;
      setFileError(
        problem instanceof Error ? problem.message : "Could not prepare those photos.",
      );
    } finally {
      if (run === prepareRun.current) setPreparing(false);
    }
  }

  function toggleRemoved(id: string) {
    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      action={(formData) => {
        if (preparing) return;
        // The picker holds the photos as chosen, which can be far larger than
        // the request may be. Send the scaled-down copies in their place.
        formData.delete("imageFile");
        for (const file of preparedImages) formData.append("imageFile", file);
        formAction(formData);
      }}
      // React resets the form after every submission, which empties the file
      // input — the previews have to go with it or they'd show files that are
      // no longer selected. Setting state here also re-renders the form, which
      // puts the controlled fields the reset disturbed back as they were.
      onReset={() => {
        prepareRun.current += 1;
        setPendingImages([]);
        setPreparedImages([]);
        setPreparing(false);
      }}
      className="space-y-8"
      noValidate
    >
      <SaveBar
        label={submitLabel}
        pending={pending}
        disabled={fileError !== null || preparing}
        onDiscard={onDiscard}
        savedKey={state.notice ? state : undefined}
      />

      <FormError>{state.formError}</FormError>

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {state.notice}
        </p>
      ) : null}

      <section className="space-y-5">
        <Field
          label="Title"
          htmlFor="title"
          error={state.fieldErrors?.title}
          hint="What buyers see on the product card."
        >
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Stoneware mug"
            autoComplete="off"
            required
            aria-invalid={Boolean(state.fieldErrors?.title)}
          />
        </Field>

        <Field
          label="Address"
          htmlFor="slug"
          error={state.fieldErrors?.slug}
          hint="The product's URL within your storefront."
        >
          <div className="flex items-center rounded-lg border border-border-strong bg-surface focus-within:border-foreground">
            <span className="pl-3 text-sm text-muted select-none">/p/</span>
            <Input
              id="slug"
              name="slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder="stoneware-mug"
              autoComplete="off"
              className="border-0 bg-transparent pl-1 focus-visible:outline-none"
              aria-invalid={Boolean(state.fieldErrors?.slug)}
            />
          </div>
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          error={state.fieldErrors?.description}
          hint="Optional. What it is, what it is made of, how big it is."
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={product?.description ?? ""}
            placeholder="Thrown by hand in Lisbon and glazed in a matte oatmeal."
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="block text-sm font-medium text-foreground">
            Visibility
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUCT_STATUS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-strong bg-surface px-3 py-2.5 has-checked:border-foreground"
              >
                <input
                  type="radio"
                  name="status"
                  value={option.value}
                  defaultChecked={(product?.status ?? "DRAFT") === option.value}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="requiresShipping"
            checked={requiresShipping}
            onChange={(event) => setRequiresShipping(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Physical product — requires shipping</span>
            <span className="block text-xs text-muted text-pretty">
              Untick for digital products and services. An order made only of these
              skips delivery at checkout and ships free.
            </span>
          </span>
        </label>
      </section>

      {collections.length > 0 ? (
        <fieldset className="space-y-2">
          {/*
            Tells the action this form carried the picker at all, so an
            unticked box means "remove" rather than "field missing".
          */}
          <input type="hidden" name="collectionsSubmitted" value="1" />
          <legend className="block text-sm font-medium text-foreground">
            Collections
          </legend>
          <p className="text-sm text-muted">
            Where this product appears when buyers browse by collection.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {collections.map((collection) => (
              <label
                key={collection.id}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm has-checked:border-foreground has-checked:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  name="collectionId"
                  value={collection.id}
                  defaultChecked={product?.collectionIds.includes(collection.id)}
                />
                {collection.title}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium tracking-tight">Options</h2>
          <p className="text-sm text-muted">Each one has its own price, stock and weight in kg.</p>
        </div>

        {state.fieldErrors?.variants ? (
          <p className="text-sm text-danger" role="alert">
            {state.fieldErrors.variants}
          </p>
        ) : null}

        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                {row.id ? (
                  <input type="hidden" name="variantId" value={row.id} />
                ) : (
                  // Keeps the id column aligned with the other repeated fields
                  // for rows that have no id yet.
                  <input type="hidden" name="variantId" value="" />
                )}

                <div className="col-span-2 sm:col-span-4">
                  <Label htmlFor={`${row.key}-title`}>Name</Label>
                  <Input
                    id={`${row.key}-title`}
                    name="variantTitle"
                    value={row.title}
                    onChange={(event) =>
                      updateRow(row.key, { title: event.target.value })
                    }
                    placeholder="Small"
                    autoComplete="off"
                    className="mt-1"
                    aria-invalid={Boolean(rowErrors[index])}
                  />
                </div>

                <div className="col-span-2 sm:col-span-2">
                  <Label htmlFor={`${row.key}-sku`}>SKU</Label>
                  <Input
                    id={`${row.key}-sku`}
                    name="variantSku"
                    value={row.sku}
                    onChange={(event) =>
                      updateRow(row.key, { sku: event.target.value })
                    }
                    placeholder="Optional"
                    autoComplete="off"
                    className="mt-1"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${row.key}-price`}>Price</Label>
                  <Input
                    id={`${row.key}-price`}
                    name="variantPrice"
                    value={row.price}
                    onChange={(event) =>
                      updateRow(row.key, { price: event.target.value })
                    }
                    placeholder="24.99"
                    inputMode="decimal"
                    autoComplete="off"
                    className="mt-1 tabular"
                    aria-invalid={Boolean(rowErrors[index])}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${row.key}-compare`}>Compare at</Label>
                  <Input
                    id={`${row.key}-compare`}
                    name="variantCompareAt"
                    value={row.compareAt}
                    onChange={(event) =>
                      updateRow(row.key, { compareAt: event.target.value })
                    }
                    placeholder="—"
                    inputMode="decimal"
                    autoComplete="off"
                    className="mt-1 tabular"
                  />
                </div>

                <div className="sm:col-span-1">
                  <Label htmlFor={`${row.key}-stock`}>Stock</Label>
                  <Input
                    id={`${row.key}-stock`}
                    name="variantStock"
                    value={row.stock}
                    onChange={(event) =>
                      updateRow(row.key, { stock: event.target.value })
                    }
                    inputMode="numeric"
                    autoComplete="off"
                    className="mt-1 tabular"
                    aria-invalid={Boolean(rowErrors[index])}
                  />
                </div>

                <div className="sm:col-span-1">
                  <Label htmlFor={`${row.key}-weight`}>Weight</Label>
                  <Input
                    id={`${row.key}-weight`}
                    name="variantWeight"
                    value={row.weight}
                    onChange={(event) =>
                      updateRow(row.key, { weight: event.target.value })
                    }
                    placeholder="kg"
                    aria-label="Weight in kilograms"
                    inputMode="decimal"
                    autoComplete="off"
                    className="mt-1 tabular"
                    aria-invalid={Boolean(rowErrors[index])}
                  />
                </div>
              </div>

              {rowErrors[index] ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {rowErrors[index]}
                </p>
              ) : null}

              {rows.length > 1 ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRows((current) =>
                        current.filter((candidate) => candidate.key !== row.key),
                      )
                    }
                  >
                    Remove option
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {rows.length < MAX_VARIANTS ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((current) => [...current, blankRow()])}
          >
            Add another option
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-tight">Photos</h2>

        {state.fieldErrors?.images || fileError ? (
          <p className="text-sm text-danger" role="alert">
            {fileError ?? state.fieldErrors?.images}
          </p>
        ) : null}

        {existingImages.length > 0 || pendingImages.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {existingImages.map((image) => {
              const markedForRemoval = removed.has(image.id);

              return (
                <li key={image.id} className="space-y-2">
                  <input type="hidden" name="existingImageId" value={image.id} />

                  <div
                    className={
                      markedForRemoval
                        ? "relative aspect-square overflow-hidden rounded-xl bg-surface-subtle opacity-40"
                        : "relative aspect-square overflow-hidden rounded-xl bg-surface-subtle"
                    }
                  >
                    <Image
                      src={image.url}
                      alt={image.altText ?? ""}
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </div>

                  <Input
                    name="existingImageAlt"
                    defaultValue={image.altText ?? ""}
                    placeholder="Alt text"
                    aria-label="Alt text"
                    className="h-8 text-xs"
                  />

                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      name="removeImageId"
                      value={image.id}
                      checked={markedForRemoval}
                      onChange={() => toggleRemoved(image.id)}
                    />
                    Remove on save
                  </label>
                </li>
              );
            })}

            {pendingImages.map((image) => (
              <li key={image.url} className="space-y-2">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-subtle">
                  {/* `blob:` sources skip the optimizer, so no loader config is needed. */}
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
                <p className="truncate text-xs text-foreground" title={image.name}>
                  {image.name}
                </p>
                <p className="text-xs text-muted">
                  {preparing ? "Preparing…" : "Uploads on save"}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <Field
          label={product ? "Add more photos" : "Add photos"}
          htmlFor="imageFile"
          hint={`JPEG, PNG, WebP or AVIF, up to ${MAX_SOURCE_IMAGE_MB}MB. Up to ${MAX_IMAGES_PER_UPLOAD} at a time; large photos are resized before upload.`}
        >
          <input
            id="imageFile"
            name="imageFile"
            type="file"
            multiple
            accept={IMAGE_ACCEPT_ATTRIBUTE}
            onChange={(event) => {
              // Caught here so an oversized file is reported before the upload
              // is attempted rather than after it has been sent.
              const files = Array.from(event.target.files ?? []);
              const tooMany = files.length > MAX_IMAGES_PER_UPLOAD;
              setFileError(
                tooMany
                  ? `Add at most ${MAX_IMAGES_PER_UPLOAD} images at a time.`
                  : (files.map(sourceImageRejectionReason).find(Boolean) ?? null),
              );
              // Only files that can be used get a preview; the rest are
              // covered by the error above and would render as broken images.
              const usable = files.filter((file) => sourceImageRejectionReason(file) === null);
              setPendingImages(
                usable.map((file) => ({
                  url: URL.createObjectURL(file),
                  name: file.name,
                })),
              );
              void prepareImages(tooMany ? [] : usable);
            }}
            className="block w-full cursor-pointer text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground file:transition-colors hover:file:bg-surface-hover"
          />
        </Field>
      </section>
    </form>
  );
}
