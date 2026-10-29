import * as z from "zod";

import { field, type FieldValues } from "./fields";
import { DEFAULT_THEME_FONT, THEME_FONTS } from "./typography";

/**
 * The shape of a stored theme: global settings, the header and footer every
 * storefront page shares, and each page's sections in order.
 *
 * This module checks only the envelope — ids, nesting, sizes. What a section's
 * own settings may hold depends on its type, and is checked against the
 * section registry by `./validate`.
 */

/** Bumped only for a change that old documents cannot be read through. */
export const THEME_SCHEMA_VERSION = 1;

/**
 * Well under the 1MB Server Action body limit, which the whole document has to
 * fit through on save. The database refuses anything over 256KiB as a backstop.
 */
export const MAX_THEME_BYTES = 200_000;

export const MAX_SECTIONS_PER_PAGE = 25;

/** The ceiling for any section; each type sets its own, usually lower. */
export const MAX_BLOCKS_PER_SECTION = 20;

/** Short, URL- and attribute-safe, and unique within the document. */
export const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

export const PAGE_TYPES = ["home"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * Settings that apply to the whole storefront, declared the same way a
 * section declares its own so the editor draws them with the same form.
 */
export const THEME_SETTINGS = {
  accent: field.color({
    label: "Accent colour",
    help: "Buttons and highlights. Publishing also makes it your store's colour across Tender.",
    nullLabel: "Use your store's colour",
  }),
  headingFont: field.select({
    label: "Heading font",
    options: THEME_FONTS.map(({ value, label }) => ({ value, label })),
    default: DEFAULT_THEME_FONT,
  }),
  bodyFont: field.select({
    label: "Body font",
    options: THEME_FONTS.map(({ value, label }) => ({ value, label })),
    default: DEFAULT_THEME_FONT,
  }),
};

export type ThemeSettings = FieldValues<typeof THEME_SETTINGS>;

export type ThemeBlock = {
  id: string;
  type: string;
  hidden: boolean;
  settings: Record<string, unknown>;
};

export type ThemeSection = {
  id: string;
  type: string;
  hidden: boolean;
  settings: Record<string, unknown>;
  blocks: ThemeBlock[];
};

export type ThemeDocument = {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  settings: ThemeSettings;
  /** Rendered by the storefront layout, on every page. */
  layout: { header: ThemeSection; footer: ThemeSection };
  pages: Record<PageType, { sections: ThemeSection[] }>;
};

const idSchema = z
  .string()
  .regex(THEME_ID_PATTERN, "Ids are up to 24 lowercase letters, digits and hyphens.");

const settingsRecord = z.record(z.string(), z.unknown());

const blockEnvelope = z.object({
  id: idSchema,
  type: z.string().min(1).max(40),
  hidden: z.boolean().default(false),
  settings: settingsRecord.default({}),
});

const sectionEnvelope = z.object({
  id: idSchema,
  type: z.string().min(1).max(40),
  hidden: z.boolean().default(false),
  settings: settingsRecord.default({}),
  blocks: z
    .array(blockEnvelope)
    .max(MAX_BLOCKS_PER_SECTION, `A section holds at most ${MAX_BLOCKS_PER_SECTION} blocks.`)
    .default([]),
});

export const themeEnvelopeSchema = z.object({
  schemaVersion: z.literal(THEME_SCHEMA_VERSION),
  settings: settingsRecord.default({}),
  layout: z.object({ header: sectionEnvelope, footer: sectionEnvelope }),
  pages: z.object({
    home: z.object({
      sections: z
        .array(sectionEnvelope)
        .max(MAX_SECTIONS_PER_PAGE, `A page holds at most ${MAX_SECTIONS_PER_PAGE} sections.`),
    }),
  }),
});
