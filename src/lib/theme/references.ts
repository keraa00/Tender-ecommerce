import type { ThemeDocument } from "./document";
import type { Fields, ThemeLink } from "./fields";
import { getSectionDefinition } from "./registry";

/**
 * The collections a theme names, wherever it names them — a collection
 * setting, a list of them, or a button that links to one — with where.
 *
 * The write path looks these up to refuse ids that belong to another store.
 * Rendering never would show one (sections only ever see their own store's
 * collections), but a theme should not be able to hold another tenant's ids
 * at all.
 */
export function themeCollectionReferences(
  theme: ThemeDocument,
): { id: string; path: string }[] {
  const references: { id: string; path: string }[] = [];

  const visit = (fields: Fields, settings: Record<string, unknown>, path: string) => {
    for (const [key, field] of Object.entries(fields)) {
      const value = settings[key];
      if (field.kind === "collection" && typeof value === "string") {
        references.push({ id: value, path: `${path}.${key}` });
      } else if (field.kind === "collection_list" && Array.isArray(value)) {
        for (const id of value) {
          if (typeof id === "string") references.push({ id, path: `${path}.${key}` });
        }
      } else if (field.kind === "link") {
        const link = value as ThemeLink | undefined;
        if (link?.kind === "collection") {
          references.push({ id: link.collectionId, path: `${path}.${key}` });
        }
      }
    }
  };

  const sections = [
    { section: theme.layout.header, path: "layout.header" },
    { section: theme.layout.footer, path: "layout.footer" },
    ...theme.pages.home.sections.map((section, index) => ({
      section,
      path: `pages.home.sections.${index}`,
    })),
  ];

  for (const { section, path } of sections) {
    const definition = getSectionDefinition(section.type);
    if (!definition) continue;

    visit(definition.settings, section.settings, `${path}.settings`);
    section.blocks.forEach((block, index) => {
      const blockDefinition = definition.blocks[block.type];
      if (blockDefinition) {
        visit(blockDefinition.settings, block.settings, `${path}.blocks.${index}.settings`);
      }
    });
  }

  return references;
}
