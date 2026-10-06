"use client";

import Image from "next/image";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { UploadThemeImageResult } from "@/lib/theme/actions";
import type {
  CollectionListField,
  ColorField,
  Field as FieldDescriptor,
  Fields,
  ImageField,
  LinkField,
  ThemeLink,
} from "@/lib/theme/fields";
import { shrinkImage } from "./shrink-image";

/**
 * Inputs generated from field descriptors — a section's, a block's or the
 * theme's own. The descriptors are the ones the server validates against, so
 * the panel cannot offer a value a save will refuse, or miss a setting a
 * section declares. Adding a section type adds its settings here for free.
 *
 * Controlled: every change goes straight to the editor's document, which is
 * what the live preview renders.
 */

export type SettingsFieldsContext = {
  /** What a colour set to "inherit" currently looks like. */
  colorFallback: string;
  /** The store's collections, for pickers and links. */
  collections: { id: string; title: string }[];
  uploadImage: (formData: FormData) => Promise<UploadThemeImageResult>;
};

export function SettingsFields({
  fields,
  values,
  onChange,
  errors = {},
  context,
}: {
  fields: Fields;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** By setting key, from the server's last check. */
  errors?: Record<string, string>;
  context: SettingsFieldsContext;
}) {
  const prefix = useId();

  return (
    <div className="space-y-5">
      {Object.entries(fields).map(([key, field]) => (
        <SettingInput
          key={key}
          id={`${prefix}-${key}`}
          field={field}
          value={values[key]}
          onChange={(value) => onChange(key, value)}
          error={errors[key]}
          context={context}
        />
      ))}
    </div>
  );
}

const selectClasses = cn(
  "h-10 w-full cursor-pointer rounded-lg border border-border-strong bg-surface px-3",
  "text-sm text-foreground aria-[invalid=true]:border-danger",
);

function SettingInput({
  id,
  field,
  value,
  onChange,
  error,
  context,
}: {
  id: string;
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  context: SettingsFieldsContext;
}) {
  const invalid = Boolean(error);

  switch (field.kind) {
    case "text":
      return (
        <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            aria-invalid={invalid}
          />
        </Field>
      );

    case "textarea":
      return (
        <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
          <Textarea
            id={id}
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            aria-invalid={invalid}
          />
        </Field>
      );

    case "select":
      return (
        <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
          <select
            id={id}
            value={String(value ?? field.default)}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={invalid}
            className={selectClasses}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      );

    case "checkbox":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            {field.label}
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : field.help ? (
            <p className="ps-6 text-sm text-muted">{field.help}</p>
          ) : null}
        </div>
      );

    case "range":
      return (
        <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-hidden
              tabIndex={-1}
              min={field.min}
              max={field.max}
              step={field.step}
              value={typeof value === "number" && !Number.isNaN(value) ? value : field.default}
              onChange={(event) => onChange(Number(event.target.value))}
              className="min-w-0 flex-1 cursor-pointer accent-[var(--primary)]"
            />
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={field.step}
              // An emptied box is NaN, which the server names as a problem.
              value={typeof value === "number" && !Number.isNaN(value) ? value : ""}
              onChange={(event) =>
                onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))
              }
              aria-invalid={invalid}
              className="w-20 tabular"
            />
            {field.unit ? <span className="text-sm text-muted">{field.unit}</span> : null}
          </div>
        </Field>
      );

    case "color":
      return (
        <ColorInput
          id={id}
          field={field}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
          fallback={context.colorFallback}
          error={error}
        />
      );

    case "image":
      return (
        <ImageInput
          id={id}
          field={field}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
          upload={context.uploadImage}
          error={error}
        />
      );

    case "collection":
      return (
        <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
          <select
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
            aria-invalid={invalid}
            className={selectClasses}
          >
            <option value="">None</option>
            {context.collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.title}
              </option>
            ))}
          </select>
        </Field>
      );

    case "collection_list":
      return (
        <CollectionListInput
          id={id}
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          collections={context.collections}
          error={error}
        />
      );

    case "link":
      return (
        <LinkInput
          id={id}
          field={field}
          value={(value as ThemeLink | undefined) ?? field.default}
          onChange={onChange}
          collections={context.collections}
          error={error}
        />
      );
  }
}

/** A colour, or — where the field allows it — "inherit", stored as null. */
function ColorInput({
  id,
  field,
  value,
  onChange,
  fallback,
  error,
}: {
  id: string;
  field: ColorField;
  value: string | null;
  onChange: (value: unknown) => void;
  fallback: string;
  error?: string;
}) {
  const inherit = value === null && Boolean(field.nullLabel);

  return (
    <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
      <div className="flex flex-wrap items-center gap-4">
        <input
          id={id}
          type="color"
          value={value ?? fallback}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          disabled={inherit}
          aria-invalid={Boolean(error)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-border-strong bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {field.nullLabel ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inherit}
              onChange={(event) =>
                onChange(event.target.checked ? null : fallback.toLowerCase())
              }
            />
            {field.nullLabel}
          </label>
        ) : null}
      </div>
    </Field>
  );
}

/** An uploaded image: shrunk in the browser, stored under the store's prefix. */
function ImageInput({
  id,
  field,
  value,
  onChange,
  upload,
  error,
}: {
  id: string;
  field: ImageField;
  value: string | null;
  onChange: (value: unknown) => void;
  upload: SettingsFieldsContext["uploadImage"];
  error?: string;
}) {
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setPending(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set("image", await shrinkImage(file));
      const result = await upload(formData);
      if (result.ok) onChange(result.url);
      else setUploadError(result.error);
    } catch (problem) {
      setUploadError(problem instanceof Error ? problem.message : "Could not upload the image.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Field label={field.label} hint={field.help} error={uploadError ?? error} htmlFor={id}>
      <div className="space-y-2">
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border bg-surface-subtle">
          {value ? (
            <Image src={value} alt="" fill sizes="320px" className="object-cover" />
          ) : (
            <p className="grid h-full place-items-center text-sm text-muted">No image</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={id}
            aria-disabled={pending}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-hover",
              pending && "pointer-events-none opacity-50",
            )}
          >
            {pending ? "Uploading…" : value ? "Replace" : "Upload image"}
          </label>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={pending}
            onChange={(event) => void choose(event.currentTarget)}
          />
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

/** Collections in the seller's order: pick, reorder, remove. */
function CollectionListInput({
  id,
  field,
  value,
  onChange,
  collections,
  error,
}: {
  id: string;
  field: CollectionListField;
  value: string[];
  onChange: (value: unknown) => void;
  collections: SettingsFieldsContext["collections"];
  error?: string;
}) {
  const titles = new Map(collections.map((collection) => [collection.id, collection.title]));
  const available = collections.filter((collection) => !value.includes(collection.id));

  const move = (index: number, offset: -1 | 1) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    onChange(next);
  };

  return (
    <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
      <div className="space-y-2">
        {value.length > 0 ? (
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {value.map((collectionId, index) => {
              const title = titles.get(collectionId) ?? "Deleted collection";
              return (
                <li key={collectionId} className="flex items-center gap-1 bg-surface px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate ps-1">{title}</span>
                  <IconButton
                    label={`Move ${title} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${title} down`}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label={`Remove ${title}`}
                    onClick={() => onChange(value.filter((entry) => entry !== collectionId))}
                  >
                    ×
                  </IconButton>
                </li>
              );
            })}
          </ol>
        ) : null}
        <select
          id={id}
          value=""
          disabled={available.length === 0 || value.length >= field.max}
          onChange={(event) => {
            if (event.target.value) onChange([...value, event.target.value]);
          }}
          className={selectClasses}
        >
          <option value="">
            {value.length >= field.max ? `Up to ${field.max} collections` : "Add a collection…"}
          </option>
          {available.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

const LINK_KINDS: { value: ThemeLink["kind"]; label: string }[] = [
  { value: "catalog", label: "Catalogue" },
  { value: "home", label: "Home page" },
  { value: "contact", label: "Contact page" },
  { value: "collection", label: "A collection" },
  { value: "url", label: "Web address" },
];

/** Where a button goes: a storefront page, a collection, or a web address. */
function LinkInput({
  id,
  field,
  value,
  onChange,
  collections,
  error,
}: {
  id: string;
  field: LinkField;
  value: ThemeLink;
  onChange: (value: unknown) => void;
  collections: SettingsFieldsContext["collections"];
  error?: string;
}) {
  const choose = (kind: ThemeLink["kind"]): ThemeLink => {
    switch (kind) {
      case "collection":
        return { kind, collectionId: collections[0]?.id ?? "" };
      case "url":
        return { kind, url: "https://" };
      default:
        return { kind };
    }
  };

  return (
    <Field label={field.label} hint={field.help} error={error} htmlFor={id}>
      <div className="space-y-2">
        <select
          id={id}
          value={value.kind}
          onChange={(event) => onChange(choose(event.target.value as ThemeLink["kind"]))}
          aria-invalid={Boolean(error)}
          className={selectClasses}
        >
          {LINK_KINDS.map((kind) => (
            <option
              key={kind.value}
              value={kind.value}
              disabled={kind.value === "collection" && collections.length === 0}
            >
              {kind.label}
            </option>
          ))}
        </select>
        {value.kind === "collection" ? (
          <select
            aria-label="Collection"
            value={value.collectionId}
            onChange={(event) => onChange({ kind: "collection", collectionId: event.target.value })}
            className={selectClasses}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.title}
              </option>
            ))}
          </select>
        ) : null}
        {value.kind === "url" ? (
          <Input
            aria-label="Web address"
            type="url"
            inputMode="url"
            value={value.url}
            onChange={(event) => onChange({ kind: "url", url: event.target.value })}
            aria-invalid={Boolean(error)}
          />
        ) : null}
      </div>
    </Field>
  );
}

export function IconButton({
  label,
  onClick,
  disabled = false,
  pressed,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors",
        "hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}
