import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { en } from "@/lib/i18n/admin/en";
import { storagePathFromPublicUrl } from "@/lib/products/constants";
import type { AnySectionDefinition } from "./define";
import { defaultTheme } from "./default-theme";
import {
  MAX_SECTIONS_PER_PAGE,
  MAX_THEME_BYTES,
  THEME_ID_PATTERN,
  THEME_SCHEMA_VERSION,
  THEME_SETTINGS,
  themeEnvelopeSchema,
  type ThemeBlock,
  type ThemeDocument,
  type ThemeSection,
  type ThemeSettings,
} from "./document";
import { fieldDefault, fieldSchema, type Fields } from "./fields";
import { getSectionDefinition } from "./registry";

/**
 * The two ways a theme document is read.
 *
 * Writes are strict: `parseThemeForWrite` turns away anything the registry
 * does not describe exactly — an unknown section, a block the section does not
 * take, one block too many, a heading a character too long — and says where.
 * What reaches the database is a document the current code fully understands.
 *
 * Reads are lenient: `resolveTheme` never throws. A stored theme can outlive
 * the code that wrote it — a section type removed, a setting's options
 * narrowed — and a storefront must not go down because of it. Whatever no
 * longer fits is dropped or put back to its default, one setting at a time, so
 * a single stale value does not cost the seller the rest of their design.
 *
 * Neither checks that referenced collections belong to the store; the write
 * action does that against the database. Image URLs are checked here when the
 * caller passes a policy, because that needs no database: see
 * `storeImageUrlPolicy`.
 */

export type ThemeIssue = { path: string; message: string };

export type ParsedTheme =
  | { ok: true; theme: ThemeDocument }
  | { ok: false; issues: ThemeIssue[] };

export type ThemeWriteOptions = {
  /** Whether an image URL may be stored. Without one, any https URL passes. */
  isAllowedImageUrl?: (url: string) => boolean;
  /**
   * The admin's copy, to word the issues in the seller's language. English
   * when left out. Writes only ever happen on the server, so English is never
   * sent to a browser that did not need it.
   */
  t?: AdminMessages;
};

/** A section type's name as the seller's admin language calls it. */
function sectionName(t: AdminMessages, definition: AnySectionDefinition): string {
  const copy = (t.themeSections as Record<string, { name: string } | undefined>)[definition.type];
  return copy?.name ?? definition.name;
}

/**
 * Images must be this store's own uploads. `next/image` will only fetch from
 * the hosts in `next.config.ts`, and within the upload bucket only this store's
 * prefix is the seller's to use.
 */
export function storeImageUrlPolicy(
  storeId: string,
  supabaseUrl: string,
): (url: string) => boolean {
  return (url) => {
    const path = storagePathFromPublicUrl(url, supabaseUrl);
    return path !== null && path.startsWith(`${storeId}/`) && !path.includes("..");
  };
}

// ---------------------------------------------------------------------------
// Strict: writes
// ---------------------------------------------------------------------------

export function parseThemeForWrite(
  input: unknown,
  options: ThemeWriteOptions = {},
): ParsedTheme {
  const t = options.t ?? en;
  const say = t.themeValidation;
  const size = byteLength(input);
  if (size === null) {
    return { ok: false, issues: [{ path: "", message: say.invalidJson }] };
  }
  if (size > MAX_THEME_BYTES) {
    return { ok: false, issues: [{ path: "", message: say.tooLarge }] };
  }

  const envelope = themeEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return {
      ok: false,
      issues: envelope.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const issues: ThemeIssue[] = [];
  const ids = new Set<string>();
  const { data } = envelope;

  const claimId = (id: string, path: string) => {
    if (ids.has(id)) issues.push({ path: `${path}.id`, message: format(say.duplicateId, { id }) });
    ids.add(id);
  };

  const writeSection = (
    raw: (typeof data.pages.home.sections)[number],
    path: string,
    slot: "header" | "footer" | "page",
  ): ThemeSection | null => {
    claimId(raw.id, path);

    const definition = getSectionDefinition(raw.type);
    if (!definition) {
      issues.push({ path: `${path}.type`, message: format(say.unknownSection, { type: raw.type }) });
      return null;
    }
    if ((definition.pinned ?? "page") !== slot) {
      issues.push({
        path: `${path}.type`,
        message:
          slot === "page"
            ? format(say.notOnPage, { section: sectionName(t, definition) })
            : slot === "header"
              ? say.onlyHeader
              : say.onlyFooter,
      });
      return null;
    }

    const blocks: ThemeBlock[] = [];
    raw.blocks.forEach((block, index) => {
      const blockPath = `${path}.blocks.${index}`;
      claimId(block.id, blockPath);

      const blockDefinition = definition.blocks[block.type];
      if (!blockDefinition) {
        issues.push({
          path: `${blockPath}.type`,
          message: format(say.unknownBlock, {
            section: sectionName(t, definition),
            block: block.type,
          }),
        });
        return;
      }
      blocks.push({
        id: block.id,
        type: block.type,
        hidden: block.hidden,
        settings: writeSettings(
          blockDefinition.settings,
          block.settings,
          `${blockPath}.settings`,
          issues,
          options,
          t,
        ),
      });
    });

    if (raw.blocks.length > definition.maxBlocks) {
      issues.push({
        path: `${path}.blocks`,
        message: format(say.blocksFull, {
          section: sectionName(t, definition),
          max: definition.maxBlocks,
        }),
      });
    }

    return {
      id: raw.id,
      type: raw.type,
      hidden: raw.hidden,
      settings: writeSettings(
        definition.settings,
        raw.settings,
        `${path}.settings`,
        issues,
        options,
        t,
      ),
      blocks,
    };
  };

  const settings = writeSettings(THEME_SETTINGS, data.settings, "settings", issues, options, t);
  const header = writeSection(data.layout.header, "layout.header", "header");
  const footer = writeSection(data.layout.footer, "layout.footer", "footer");

  const counts = new Map<string, number>();
  const sections = data.pages.home.sections.flatMap((raw, index) => {
    const path = `pages.home.sections.${index}`;
    const section = writeSection(raw, path, "page");
    if (!section) return [];

    const count = (counts.get(section.type) ?? 0) + 1;
    counts.set(section.type, count);
    const definition = getSectionDefinition(section.type) as AnySectionDefinition;
    if (count === definition.maxPerPage + 1) {
      issues.push({
        path,
        message: format(say.tooManyOfType, {
          max: definition.maxPerPage,
          section: sectionName(t, definition),
        }),
      });
    }
    return [section];
  });

  if (issues.length > 0 || !header || !footer) return { ok: false, issues };

  return {
    ok: true,
    theme: {
      schemaVersion: THEME_SCHEMA_VERSION,
      settings: settings as ThemeSettings,
      layout: { header, footer },
      pages: { home: { sections } },
    },
  };
}

/**
 * Each declared setting, checked; a missing one takes its default, and keys
 * nothing declares are dropped rather than stored.
 */
function writeSettings(
  fields: Fields,
  raw: Record<string, unknown>,
  path: string,
  issues: ThemeIssue[],
  options: ThemeWriteOptions,
  t: AdminMessages,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(fields)) {
    if (raw[key] === undefined) {
      settings[key] = fieldDefault(field);
      continue;
    }

    const parsed = fieldSchema(field, t.themeValidation.field).safeParse(raw[key]);
    if (!parsed.success) {
      issues.push({
        path: `${path}.${key}`,
        message: parsed.error.issues[0]?.message ?? t.themeValidation.invalid,
      });
      continue;
    }

    if (
      field.kind === "image" &&
      typeof parsed.data === "string" &&
      options.isAllowedImageUrl &&
      !options.isAllowedImageUrl(parsed.data)
    ) {
      issues.push({ path: `${path}.${key}`, message: t.themeValidation.uploadImage });
      continue;
    }

    settings[key] = parsed.data;
  }

  return settings;
}

function byteLength(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? null : new TextEncoder().encode(json).length;
  } catch {
    // Cycles and BigInts: nothing a browser could have sent as JSON.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lenient: reads
// ---------------------------------------------------------------------------

/**
 * A stored theme as the current code can render it. Never throws; anything
 * unrecognisable at the top level is the default theme.
 *
 * `schemaVersion` is where a future breaking change would upgrade old
 * documents before reading them. There has been none, so any other version is
 * one this code cannot read.
 */
export function resolveTheme(raw: unknown): ThemeDocument {
  const fallback = defaultTheme();
  if (!isRecord(raw) || raw.schemaVersion !== THEME_SCHEMA_VERSION) return fallback;

  const ids = new Set<string>();
  const layout = isRecord(raw.layout) ? raw.layout : {};
  const header = readSection(layout.header, "header", ids) ?? fallback.layout.header;
  const footer = readSection(layout.footer, "footer", ids) ?? fallback.layout.footer;

  const pages = isRecord(raw.pages) ? raw.pages : {};
  const home = isRecord(pages.home) ? pages.home : null;

  let sections: ThemeSection[];
  if (!home || !Array.isArray(home.sections)) {
    // A page the document never had gets the default. An empty list is a
    // seller who removed every section, and that is respected.
    sections = fallback.pages.home.sections;
  } else {
    const counts = new Map<string, number>();
    sections = [];
    for (const entry of home.sections) {
      if (sections.length === MAX_SECTIONS_PER_PAGE) break;

      const section = readSection(entry, "page", ids);
      if (!section) continue;

      const count = (counts.get(section.type) ?? 0) + 1;
      const definition = getSectionDefinition(section.type) as AnySectionDefinition;
      if (count > definition.maxPerPage) continue;
      counts.set(section.type, count);
      sections.push(section);
    }
  }

  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    settings: readSettings(THEME_SETTINGS, raw.settings) as ThemeSettings,
    layout: { header, footer },
    pages: { home: { sections } },
  };
}

function readSection(
  raw: unknown,
  slot: "header" | "footer" | "page",
  ids: Set<string>,
): ThemeSection | null {
  if (!isRecord(raw) || !isId(raw.id) || ids.has(raw.id) || typeof raw.type !== "string") {
    return null;
  }

  const definition = getSectionDefinition(raw.type);
  if (!definition || (definition.pinned ?? "page") !== slot) return null;

  ids.add(raw.id);

  const blocks: ThemeBlock[] = [];
  for (const entry of Array.isArray(raw.blocks) ? raw.blocks : []) {
    if (blocks.length === definition.maxBlocks) break;
    if (!isRecord(entry) || !isId(entry.id) || ids.has(entry.id)) continue;
    if (typeof entry.type !== "string") continue;

    const blockDefinition = definition.blocks[entry.type];
    if (!blockDefinition) continue;

    ids.add(entry.id);
    blocks.push({
      id: entry.id,
      type: entry.type,
      hidden: entry.hidden === true,
      settings: readSettings(blockDefinition.settings, entry.settings),
    });
  }

  return {
    id: raw.id,
    type: raw.type,
    hidden: raw.hidden === true,
    settings: readSettings(definition.settings, raw.settings),
    blocks,
  };
}

/** Each declared setting, or its default when missing or no longer valid. */
function readSettings(fields: Fields, raw: unknown): Record<string, unknown> {
  const source = isRecord(raw) ? raw : {};

  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      const parsed = fieldSchema(field).safeParse(source[key]);
      return [key, parsed.success ? parsed.data : fieldDefault(field)];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && THEME_ID_PATTERN.test(value);
}
