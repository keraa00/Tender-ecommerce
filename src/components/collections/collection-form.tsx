"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import { SaveBar, useDiscard } from "@/components/admin/save-bar";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import type { CollectionFormState } from "@/lib/collections/actions";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { slugify } from "@/lib/slug";

/**
 * A collection is a title, an address and an ordered list of products. The
 * order is the one buyers see under "Featured", so the chosen products render
 * as a list the seller can rearrange, and each posts as a repeated `productId`
 * in that order.
 */

export type CollectionProductOption = {
  id: string;
  title: string;
  /** Human label for the product's status; drafts are worth flagging. */
  statusLabel: string;
  published: boolean;
  imageUrl: string | null;
};

export type CollectionFormCollection = {
  title: string;
  slug: string;
  description: string | null;
  productIds: string[];
};

type CollectionFormProps = {
  action: (
    state: CollectionFormState,
    formData: FormData,
  ) => Promise<CollectionFormState>;
  collection?: CollectionFormCollection;
  products: CollectionProductOption[];
  submitLabel: string;
  t: AdminMessages["collections"]["form"];
};

export function CollectionForm(props: CollectionFormProps) {
  const { key, discard } = useDiscard();
  return <CollectionFormBody key={key} {...props} onDiscard={discard} />;
}

function CollectionFormBody({
  action,
  collection,
  products,
  submitLabel,
  t,
  onDiscard,
}: CollectionFormProps & { onDiscard: () => void }) {
  const { intl } = useAdminI18n();
  const [state, formAction, pending] = useActionState<CollectionFormState, FormData>(
    action,
    {},
  );

  const [title, setTitle] = useState(collection?.title ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(collection));
  const [selected, setSelected] = useState<string[]>(
    () => collection?.productIds ?? [],
  );
  const [query, setQuery] = useState("");

  const effectiveSlug = slugEdited ? slug : slugify(title);

  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const selectedSet = new Set(selected);
  const needle = query.trim().toLowerCase();
  const available = products.filter(
    (product) =>
      !selectedSet.has(product.id) &&
      (needle === "" || product.title.toLowerCase().includes(needle)),
  );

  function move(index: number, delta: -1 | 1) {
    setSelected((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <SaveBar
        label={submitLabel}
        pending={pending}
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
          label={t.title}
          htmlFor="title"
          error={state.fieldErrors?.title}
          hint={t.titleHint}
        >
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.titlePlaceholder}
            autoComplete="off"
            required
            aria-invalid={Boolean(state.fieldErrors?.title)}
          />
        </Field>

        <Field
          label={t.address}
          htmlFor="slug"
          error={state.fieldErrors?.slug}
          hint={t.addressHint}
        >
          {/* A URL reads left to right in every language. */}
          <div
            dir="ltr"
            className="flex items-center rounded-lg border border-border-strong bg-surface focus-within:border-foreground"
          >
            <span className="ps-3 text-sm text-muted select-none">
              /collections/
            </span>
            <Input
              id="slug"
              name="slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder={t.addressPlaceholder}
              autoComplete="off"
              className="border-0 bg-transparent ps-1 focus-visible:outline-none"
              aria-invalid={Boolean(state.fieldErrors?.slug)}
            />
          </div>
        </Field>

        <Field
          label={t.description}
          htmlFor="description"
          error={state.fieldErrors?.description}
          hint={t.descriptionHint}
        >
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={collection?.description ?? ""}
            placeholder={t.descriptionPlaceholder}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium tracking-tight">{t.productsInCollection}</h2>
          <p className="text-sm text-muted tabular">
            {format(t.chosen, { count: new Intl.NumberFormat(intl).format(selected.length) })}
          </p>
        </div>

        {state.fieldErrors?.products ? (
          <p className="text-sm text-danger" role="alert">
            {state.fieldErrors.products}
          </p>
        ) : null}

        {selected.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
            {t.noneYet}
          </p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {selected.map((id, index) => {
              const product = byId.get(id);
              if (!product) return null;

              return (
                <li
                  key={id}
                  className="flex items-center gap-3 bg-surface px-3 py-2"
                >
                  <input type="hidden" name="productId" value={id} />
                  <span className="w-5 shrink-0 text-end text-xs text-muted tabular">
                    {new Intl.NumberFormat(intl).format(index + 1)}
                  </span>
                  <Thumb url={product.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {product.title}
                    </span>
                    {!product.published ? (
                      <span className="block text-xs text-warning">
                        {format(t.hiddenFromBuyers, { status: product.statusLabel })}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      label={format(t.moveUp, { product: product.title })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <path d="m6 15 6-6 6 6" />
                    </IconButton>
                    <IconButton
                      label={format(t.moveDown, { product: product.title })}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </IconButton>
                    <IconButton
                      label={format(t.remove, { product: product.title })}
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((candidate) => candidate !== id),
                        )
                      }
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-tight">{t.addProducts}</h2>

        {products.length === 0 ? (
          <p className="text-sm text-muted">
            {t.emptyCatalogue}
          </p>
        ) : (
          <>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.filter}
              aria-label={t.filter}
            />

            {available.length === 0 ? (
              <p className="text-sm text-muted">
                {needle
                  ? t.noMatch
                  : t.allAdded}
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {available.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((current) => [...current, product.id])
                      }
                      className="flex w-full cursor-pointer items-center gap-3 bg-surface px-3 py-2 text-start transition-colors hover:bg-surface-hover"
                    >
                      <Thumb url={product.imageUrl} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {product.title}
                      </span>
                      {!product.published ? (
                        <span className="shrink-0 text-xs text-muted">
                          {product.statusLabel}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-sm font-medium text-muted">
                        {t.add}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

    </form>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-surface-subtle">
      {url ? (
        <Image src={url} alt="" fill sizes="36px" className="object-cover" />
      ) : null}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        {children}
      </svg>
    </button>
  );
}
