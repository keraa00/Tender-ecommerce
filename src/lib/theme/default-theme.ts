import {
  THEME_SCHEMA_VERSION,
  THEME_SETTINGS,
  type ThemeDocument,
  type ThemeSection,
} from "./document";
import { settingsDefaults } from "./fields";
import { getSectionDefinition } from "./registry";

/**
 * A new section of `type` with every setting at its default.
 *
 * Throws on an unknown type or block type: callers name types from the
 * registry in code, so a miss is a programming error, not bad input.
 */
export function newSection(
  type: string,
  id: string,
  blocks: { id: string; type: string }[] = [],
): ThemeSection {
  const definition = getSectionDefinition(type);
  if (!definition) throw new Error(`Unknown theme section type "${type}".`);

  return {
    id,
    type,
    hidden: false,
    settings: settingsDefaults(definition.settings),
    blocks: blocks.map((block) => {
      const blockDefinition = definition.blocks[block.type];
      if (!blockDefinition) {
        throw new Error(`Section "${type}" has no block type "${block.type}".`);
      }
      return {
        id: block.id,
        type: block.type,
        hidden: false,
        settings: settingsDefaults(blockDefinition.settings),
      };
    }),
  };
}

/**
 * The theme every store has until it saves one of its own: the storefront as
 * it was hard-coded before themes existed — banner, collections, the eight
 * newest products.
 *
 * It stores no copy. Every heading and label is left empty and so falls back
 * to the buyer's language; see `textOr`. Rendered from code rather than written
 * into the database, so improving it reaches every store that never changed
 * theirs.
 *
 * The ids are chosen to keep the page's existing anchors: sections use
 * `<id>-heading`, and the home page has always had `#collections-heading` and
 * `#new-heading`.
 */
export function defaultTheme(): ThemeDocument {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    settings: settingsDefaults(THEME_SETTINGS),
    layout: {
      header: newSection("header", "header"),
      footer: newSection("footer", "footer"),
    },
    pages: {
      home: {
        sections: [
          newSection("hero", "hero", [{ id: "hero-button", type: "button" }]),
          newSection("featured-collections", "collections"),
          newSection("product-grid", "new"),
        ],
      },
    },
  };
}
