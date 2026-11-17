import * as z from "zod";

import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

/**
 * The kinds of setting a theme section can declare, each of which is both a
 * zod schema (what a stored value may be) and a description the editor can
 * build an input from (label, help, limits).
 *
 * A closed set on purpose. A section says "a heading of at most 80 characters"
 * or "one of these three alignments", never "any zod schema", so every setting
 * a section can declare is one the generated settings form knows how to draw.
 * A new kind is a change here and in the form, not in every section.
 *
 * Plain data and dependency-free apart from zod: the descriptors travel to the
 * editor, a Client Component, as JSON.
 */

type FieldBase = {
  label: string;
  /** One line under the input. */
  help?: string;
};

export type TextField = FieldBase & {
  kind: "text";
  default: string;
  maxLength: number;
  /**
   * Shown in the empty input. For copy that falls back to a translated default
   * when left empty, this is that default in English, so the seller can see
   * what the buyer gets.
   */
  placeholder?: string;
};

export type TextareaField = FieldBase & {
  kind: "textarea";
  default: string;
  maxLength: number;
  placeholder?: string;
};

export type SelectField<V extends string = string> = FieldBase & {
  kind: "select";
  default: V;
  options: readonly { value: V; label: string }[];
};

export type CheckboxField = FieldBase & {
  kind: "checkbox";
  default: boolean;
};

export type RangeField = FieldBase & {
  kind: "range";
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

/** A `#rrggbb` colour, or null for "inherit". */
export type ColorField = FieldBase & {
  kind: "color";
  default: string | null;
  /** The choice that stores null: "Use your store's colour". */
  nullLabel?: string;
};

/**
 * An uploaded image's public URL, or null. Which hosts count is decided where
 * the store is known — see `storeImageUrlPolicy` in `./validate`.
 */
export type ImageField = FieldBase & {
  kind: "image";
  default: null;
};

/** One of the store's collections, by id, or null. */
export type CollectionField = FieldBase & {
  kind: "collection";
  default: null;
};

/** Several of the store's collections, by id, in the seller's order. */
export type CollectionListField = FieldBase & {
  kind: "collection_list";
  default: string[];
  max: number;
};

export type LinkField = FieldBase & {
  kind: "link";
  default: ThemeLink;
};

export type Field =
  | TextField
  | TextareaField
  | SelectField
  | CheckboxField
  | RangeField
  | ColorField
  | ImageField
  | CollectionField
  | CollectionListField
  | LinkField;

export type FieldKind = Field["kind"];

/** A section's or block's settings, by key. */
export type Fields = Record<string, Field>;

/** The stored value for one field. */
export type FieldValue<F extends Field> =
  F extends SelectField<infer V>
    ? V
    : F extends TextField | TextareaField
      ? string
      : F extends CheckboxField
        ? boolean
        : F extends RangeField
          ? number
          : F extends ColorField | ImageField | CollectionField
            ? string | null
            : F extends CollectionListField
              ? string[]
              : F extends LinkField
                ? ThemeLink
                : never;

export type FieldValues<F extends Fields> = { [K in keyof F]: FieldValue<F[K]> };

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * Where a button goes. Storefront pages are named rather than written as
 * paths, so a link survives the store's address changing and can never point
 * into another store; collections are named by id, so renaming one does not
 * break the buttons that lead to it. Outside addresses must be http(s) — a
 * `javascript:` URL is not a link.
 */
export type ThemeLink =
  | { kind: "home" }
  | { kind: "catalog" }
  | { kind: "contact" }
  | { kind: "collection"; collectionId: string }
  | { kind: "url"; url: string };

export const MAX_URL_LENGTH = 2_048;

function linkSchema(t?: FieldMessages) {
  const httpUrl = z.url({ protocol: /^https?$/, message: t?.url }).max(MAX_URL_LENGTH);

  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("home") }),
    z.object({ kind: z.literal("catalog") }),
    z.object({ kind: z.literal("contact") }),
    z.object({ kind: z.literal("collection"), collectionId: z.uuid() }),
    z.object({ kind: z.literal("url"), url: httpUrl }),
  ]);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Field constructors with the defaults filled in. Sections declare settings
 * with these rather than with object literals, so a descriptor is always
 * complete and its value type is inferred — `settings.limit` is a number in
 * the section's component without anyone writing that down twice.
 */
export const field = {
  text: (options: Omit<TextField, "kind" | "default" | "maxLength"> & {
    default?: string;
    maxLength?: number;
  }): TextField => ({ kind: "text", default: "", maxLength: 120, ...options }),

  textarea: (options: Omit<TextareaField, "kind" | "default" | "maxLength"> & {
    default?: string;
    maxLength?: number;
  }): TextareaField => ({ kind: "textarea", default: "", maxLength: 1_000, ...options }),

  select: <const V extends string>(
    options: Omit<SelectField<V>, "kind" | "default"> & { default: NoInfer<V> },
  ): SelectField<V> => ({ kind: "select", ...options }),

  checkbox: (options: Omit<CheckboxField, "kind">): CheckboxField => ({
    kind: "checkbox",
    ...options,
  }),

  range: (options: Omit<RangeField, "kind" | "step"> & { step?: number }): RangeField => ({
    kind: "range",
    step: 1,
    ...options,
  }),

  color: (options: Omit<ColorField, "kind" | "default"> & { default?: string | null }): ColorField => ({
    kind: "color",
    default: null,
    ...options,
  }),

  image: (options: Omit<ImageField, "kind" | "default">): ImageField => ({
    kind: "image",
    default: null,
    ...options,
  }),

  collection: (options: Omit<CollectionField, "kind" | "default">): CollectionField => ({
    kind: "collection",
    default: null,
    ...options,
  }),

  collectionList: (options: Omit<CollectionListField, "kind" | "default">): CollectionListField => ({
    kind: "collection_list",
    default: [],
    ...options,
  }),

  link: (options: Omit<LinkField, "kind" | "default"> & { default?: ThemeLink }): LinkField => ({
    kind: "link",
    default: { kind: "catalog" },
    ...options,
  }),
};

// ---------------------------------------------------------------------------
// Schemas and defaults
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** How a rejected value is explained, in the seller's language. */
export type FieldMessages = AdminMessages["themeValidation"]["field"];

/**
 * What a stored value for this field may be. `t` words the refusals; the
 * lenient read of a stored theme, which only keeps or drops a value, leaves
 * it out.
 */
export function fieldSchema(field: Field, t?: FieldMessages): z.ZodType<unknown> {
  const say = (template: string | undefined, values: Record<string, number> = {}) =>
    template === undefined ? undefined : format(template, values);

  switch (field.kind) {
    case "text":
    case "textarea":
      return z
        .string()
        .trim()
        .max(field.maxLength, say(t?.tooLong, { max: field.maxLength }));
    case "select": {
      const values = field.options.map((option) => option.value);
      return z.string().refine((value) => values.includes(value), say(t?.option));
    }
    case "checkbox":
      return z.boolean();
    case "range":
      return z
        .number({ error: say(t?.number) })
        .min(field.min, say(t?.min, { min: field.min }))
        .max(field.max, say(t?.max, { max: field.max }))
        .multipleOf(field.step);
    case "color":
      return z
        .string()
        .regex(HEX_COLOR, say(t?.color))
        .transform((value) => value.toLowerCase())
        .nullable();
    case "image":
      return z
        .url({ protocol: /^https$/, message: say(t?.imageUploaded) })
        .max(MAX_URL_LENGTH)
        .nullable();
    case "collection":
      return z.uuid(say(t?.collection)).nullable();
    case "collection_list":
      return z
        .array(z.uuid(say(t?.collection)))
        // The same collection twice is a slip, not a request to show it twice,
        // so it is dropped before the count is checked.
        .transform((ids) => [...new Set(ids)])
        .pipe(z.array(z.string()).max(field.max, say(t?.tooMany, { max: field.max })));
    case "link":
      return linkSchema(t);
  }
}

/**
 * A field's words in the seller's language — what `localizeFields` lays over
 * a schema. Option labels are keyed by the option's value.
 */
export type FieldCopy = {
  label: string;
  help?: string;
  placeholder?: string;
  nullLabel?: string;
  unit?: string;
  options?: Record<string, string>;
};

/**
 * The fields with their label, help, placeholder and option labels replaced
 * by `copy`, key by key. A field `copy` does not mention keeps its schema
 * English, so a setting added without a translation still shows a label.
 */
export function localizeFields<F extends Fields>(
  fields: F,
  copy: Readonly<Record<string, FieldCopy>> | undefined,
): F {
  if (!copy) return fields;

  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      const words = copy[key];
      if (!words) return [key, field];

      const next: Field = { ...field, label: words.label };
      if (words.help !== undefined) next.help = words.help;
      if (words.placeholder !== undefined && (next.kind === "text" || next.kind === "textarea")) {
        next.placeholder = words.placeholder;
      }
      if (words.nullLabel !== undefined && next.kind === "color") next.nullLabel = words.nullLabel;
      if (words.unit !== undefined && next.kind === "range") next.unit = words.unit;
      if (words.options && next.kind === "select") {
        const labels = words.options;
        next.options = next.options.map((option) => ({
          ...option,
          label: labels[option.value] ?? option.label,
        }));
      }
      return [key, next];
    }),
  ) as F;
}

/** A fresh copy of the field's default, safe to mutate. */
export function fieldDefault(field: Field): unknown {
  return structuredClone(field.default);
}

/** Every field at its default. */
export function settingsDefaults<F extends Fields>(fields: F): FieldValues<F> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, fieldDefault(field)]),
  ) as FieldValues<F>;
}

/**
 * The seller's copy, or the translated default when they left it empty.
 *
 * Empty is how a theme says "use the platform's words": the default theme
 * stores no copy at all, so every storefront language keeps working for a
 * seller who never opens the editor. What a seller does type is shown as
 * written, like their product titles.
 */
export function textOr(value: string, fallback: string): string {
  return value.trim() === "" ? fallback : value;
}
