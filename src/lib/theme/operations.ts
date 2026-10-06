import {
  MAX_SECTIONS_PER_PAGE,
  type ThemeBlock,
  type ThemeDocument,
  type ThemeSection,
} from "./document";
import { settingsDefaults, type Fields } from "./fields";
import type { ThemeIssue } from "./validate";

/**
 * The edits the theme editor makes to a document, as pure functions.
 *
 * Each one returns a new document and leaves its input alone, so the editor
 * can keep the saved version beside the working one — and, later, a history to
 * undo through. They are written against section *manifests* rather than the
 * registry, because they run in the browser, where the section components and
 * their data access must not be bundled.
 *
 * They keep the document valid where they can (limits, unique ids, the header
 * and footer staying put), but they are a convenience, not a guard: every
 * save is checked again by `parseThemeForWrite` on the server.
 */

/** What the editor needs to know about a section type — see `sectionManifests()`. */
export type ManifestLike = {
  type: string;
  name: string;
  pinned?: "header" | "footer";
  settings: Fields;
  blocks: Record<string, { name: string; settings: Fields }>;
  maxBlocks: number;
  maxPerPage: number;
};

/** Whose settings an edit changes: the theme's, one section's, or one block's. */
export type SettingsTarget =
  | { kind: "theme" }
  | { kind: "section"; id: string }
  | { kind: "block"; sectionId: string; blockId: string };

/** Every id in the document, sections and blocks alike. */
export function themeIds(document: ThemeDocument): Set<string> {
  const ids = new Set<string>();
  for (const section of allSections(document)) {
    ids.add(section.id);
    for (const block of section.blocks) ids.add(block.id);
  }
  return ids;
}

/**
 * A readable id not yet taken: `rich-text`, then `rich-text-2`, `rich-text-3`.
 * Always matches `THEME_ID_PATTERN` — at most 24 lowercase letters, digits and
 * hyphens, starting with a letter or digit.
 */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20)
      .replace(/-+$/, "") || "section";

  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const id = `${stem}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Why a section of this type cannot be added to the page, or null if it can. */
export function addSectionBlockedReason(
  document: ThemeDocument,
  manifest: ManifestLike,
): string | null {
  if (manifest.pinned) return `The ${manifest.name.toLowerCase()} is always on the page.`;

  const { sections } = document.pages.home;
  if (sections.length >= MAX_SECTIONS_PER_PAGE) {
    return `A page holds at most ${MAX_SECTIONS_PER_PAGE} sections.`;
  }

  const count = sections.filter((section) => section.type === manifest.type).length;
  if (count >= manifest.maxPerPage) {
    return `A page holds at most ${manifest.maxPerPage} of “${manifest.name}”.`;
  }

  return null;
}

/**
 * A new section of this type, every setting at its default, inserted at
 * `index` (the end by default).
 */
export function addSection(
  document: ThemeDocument,
  manifest: ManifestLike,
  index?: number,
): { ok: true; document: ThemeDocument; id: string } | { ok: false; reason: string } {
  const reason = addSectionBlockedReason(document, manifest);
  if (reason) return { ok: false, reason };

  const id = uniqueId(manifest.type, themeIds(document));
  const section: ThemeSection = {
    id,
    type: manifest.type,
    hidden: false,
    settings: settingsDefaults(manifest.settings),
    blocks: [],
  };

  const sections = [...document.pages.home.sections];
  const at = clamp(index ?? sections.length, 0, sections.length);
  sections.splice(at, 0, section);

  return { ok: true, document: withSections(document, sections), id };
}

/** Removes a page section. The header and footer cannot be removed. */
export function removeSection(document: ThemeDocument, id: string): ThemeDocument {
  const { sections } = document.pages.home;
  if (!sections.some((section) => section.id === id)) return document;
  return withSections(
    document,
    sections.filter((section) => section.id !== id),
  );
}

/**
 * Moves a page section to `index` in the order, counted before the move. An
 * index outside the page is clamped to its ends; the header and footer are
 * not on the page and do not move.
 */
export function moveSectionTo(
  document: ThemeDocument,
  id: string,
  index: number,
): ThemeDocument {
  const { sections } = document.pages.home;
  const next = moveItem(sections, id, index);
  return next === sections ? document : withSections(document, next);
}

/** One step up (-1) or down (+1); a no-op at either end. */
export function moveSection(document: ThemeDocument, id: string, offset: -1 | 1): ThemeDocument {
  const from = document.pages.home.sections.findIndex((section) => section.id === id);
  if (from === -1) return document;
  return moveSectionTo(document, id, from + offset);
}

/** Hides or shows a page section without losing its settings. */
export function setSectionHidden(
  document: ThemeDocument,
  id: string,
  hidden: boolean,
): ThemeDocument {
  const { sections } = document.pages.home;
  const index = sections.findIndex((section) => section.id === id);
  if (index === -1 || sections[index].hidden === hidden) return document;

  const next = [...sections];
  next[index] = { ...sections[index], hidden };
  return withSections(document, next);
}

/** Sets one setting: on the theme, on any section (pinned ones too), or on a block. */
export function updateSetting(
  document: ThemeDocument,
  target: SettingsTarget,
  key: string,
  value: unknown,
): ThemeDocument {
  switch (target.kind) {
    case "theme":
      return { ...document, settings: { ...document.settings, [key]: value } };
    case "section":
      return mapSection(document, target.id, (section) => ({
        ...section,
        settings: { ...section.settings, [key]: value },
      }));
    case "block":
      return mapBlocks(document, target.sectionId, (blocks) => {
        const index = blocks.findIndex((block) => block.id === target.blockId);
        if (index === -1) return blocks;
        const next = [...blocks];
        next[index] = { ...blocks[index], settings: { ...blocks[index].settings, [key]: value } };
        return next;
      });
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** Why a block of this type cannot be added to the section, or null if it can. */
export function addBlockBlockedReason(
  document: ThemeDocument,
  sectionId: string,
  manifest: ManifestLike,
  blockType: string,
): string | null {
  const section = findSection(document, sectionId);
  if (!section || section.type !== manifest.type) return "That section is no longer on the page.";

  const block = manifest.blocks[blockType];
  if (!block) return `A ${manifest.name.toLowerCase()} cannot hold that.`;

  if (section.blocks.length >= manifest.maxBlocks) {
    return `A ${manifest.name.toLowerCase()} holds at most ${manifest.maxBlocks} ${
      manifest.maxBlocks === 1 ? "block" : "blocks"
    }.`;
  }
  return null;
}

/** A new block of this type at the end of the section, at its defaults. */
export function addBlock(
  document: ThemeDocument,
  sectionId: string,
  manifest: ManifestLike,
  blockType: string,
): { ok: true; document: ThemeDocument; id: string } | { ok: false; reason: string } {
  const reason = addBlockBlockedReason(document, sectionId, manifest, blockType);
  if (reason) return { ok: false, reason };

  const id = uniqueId(`${sectionId}-${blockType}`, themeIds(document));
  const block: ThemeBlock = {
    id,
    type: blockType,
    hidden: false,
    settings: settingsDefaults(manifest.blocks[blockType].settings),
  };

  return { ok: true, document: mapBlocks(document, sectionId, (blocks) => [...blocks, block]), id };
}

export function removeBlock(
  document: ThemeDocument,
  sectionId: string,
  blockId: string,
): ThemeDocument {
  return mapBlocks(document, sectionId, (blocks) =>
    blocks.some((block) => block.id === blockId)
      ? blocks.filter((block) => block.id !== blockId)
      : blocks,
  );
}

/** Moves a block to `index` within its section, clamped to the section's ends. */
export function moveBlockTo(
  document: ThemeDocument,
  sectionId: string,
  blockId: string,
  index: number,
): ThemeDocument {
  return mapBlocks(document, sectionId, (blocks) => moveItem(blocks, blockId, index));
}

/** One step up (-1) or down (+1) within its section; a no-op at either end. */
export function moveBlock(
  document: ThemeDocument,
  sectionId: string,
  blockId: string,
  offset: -1 | 1,
): ThemeDocument {
  const from = findSection(document, sectionId)?.blocks.findIndex((block) => block.id === blockId);
  if (from === undefined || from === -1) return document;
  return moveBlockTo(document, sectionId, blockId, from + offset);
}

export function setBlockHidden(
  document: ThemeDocument,
  sectionId: string,
  blockId: string,
  hidden: boolean,
): ThemeDocument {
  return mapBlocks(document, sectionId, (blocks) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1 || blocks[index].hidden === hidden) return blocks;
    const next = [...blocks];
    next[index] = { ...blocks[index], hidden };
    return next;
  });
}

/** A section by id, wherever it is: the header, the footer or the page. */
export function findSection(document: ThemeDocument, id: string): ThemeSection | null {
  return allSections(document).find((section) => section.id === id) ?? null;
}

/**
 * Where a section sits in the document, as validation issue paths name it —
 * so the issues the server returns can be put beside the right inputs.
 */
export function sectionPath(document: ThemeDocument, id: string): string | null {
  if (document.layout.header.id === id) return "layout.header";
  if (document.layout.footer.id === id) return "layout.footer";
  const index = document.pages.home.sections.findIndex((section) => section.id === id);
  return index === -1 ? null : `pages.home.sections.${index}`;
}

/** The issues about one target's settings, by setting key. */
export function settingsIssues(
  document: ThemeDocument,
  target: SettingsTarget,
  issues: readonly ThemeIssue[],
): Record<string, string> {
  const prefix = settingsPath(document, target);
  if (prefix === null) return {};

  const found: Record<string, string> = {};
  for (const issue of issues) {
    if (!issue.path.startsWith(`${prefix}.`)) continue;
    const key = issue.path.slice(prefix.length + 1).split(".")[0];
    found[key] ??= issue.message;
  }
  return found;
}

/** Where a target's settings sit, as issue paths name them. */
function settingsPath(document: ThemeDocument, target: SettingsTarget): string | null {
  if (target.kind === "theme") return "settings";

  const sectionId = target.kind === "section" ? target.id : target.sectionId;
  const base = sectionPath(document, sectionId);
  if (base === null) return null;
  if (target.kind === "section") return `${base}.settings`;

  const index = findSection(document, sectionId)?.blocks.findIndex(
    (block) => block.id === target.blockId,
  );
  return index === undefined || index === -1 ? null : `${base}.blocks.${index}.settings`;
}

function allSections(document: ThemeDocument): ThemeSection[] {
  return [document.layout.header, ...document.pages.home.sections, document.layout.footer];
}

/**
 * `items` with the one called `id` moved to `index` (its position after the
 * move), clamped to the ends. The same array back when nothing moves, so
 * callers can tell.
 */
function moveItem<T extends { id: string }>(items: T[], id: string, index: number): T[] {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return items;

  const to = clamp(index, 0, items.length - 1);
  if (to === from) return items;

  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** The document with one section replaced, wherever it sits. */
function mapSection(
  document: ThemeDocument,
  id: string,
  update: (section: ThemeSection) => ThemeSection,
): ThemeDocument {
  const { header, footer } = document.layout;
  if (header.id === id || footer.id === id) {
    const apply = (section: ThemeSection) => (section.id === id ? update(section) : section);
    const next = { header: apply(header), footer: apply(footer) };
    return next.header === header && next.footer === footer
      ? document
      : { ...document, layout: next };
  }

  const { sections } = document.pages.home;
  const index = sections.findIndex((section) => section.id === id);
  if (index === -1) return document;

  const section = update(sections[index]);
  if (section === sections[index]) return document;
  const next = [...sections];
  next[index] = section;
  return withSections(document, next);
}

/** The document with one section's blocks replaced; unchanged if they are. */
function mapBlocks(
  document: ThemeDocument,
  sectionId: string,
  update: (blocks: ThemeBlock[]) => ThemeBlock[],
): ThemeDocument {
  return mapSection(document, sectionId, (section) => {
    const blocks = update(section.blocks);
    return blocks === section.blocks ? section : { ...section, blocks };
  });
}

function withSections(document: ThemeDocument, sections: ThemeSection[]): ThemeDocument {
  return { ...document, pages: { ...document.pages, home: { sections } } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
