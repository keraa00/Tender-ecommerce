import type { AnySectionDefinition } from "./define";
import { localizeFields, type FieldCopy } from "./fields";
import featuredCollections from "./sections/featured-collections";
import footer from "./sections/footer";
import header from "./sections/header";
import hero from "./sections/hero";
import imageWithText from "./sections/image-with-text";
import productGrid from "./sections/product-grid";
import richText from "./sections/rich-text";

/**
 * Every section type a theme can use. A new type is a file under `./sections`
 * and a line here — the validators, the default merging and (in time) the
 * editor's forms all read from this list.
 *
 * Removing a type is safe for stored themes: `resolveTheme()` skips sections
 * whose type it no longer knows. Renaming one is a removal.
 */
const SECTIONS: readonly AnySectionDefinition[] = [
  header,
  hero,
  featuredCollections,
  productGrid,
  richText,
  imageWithText,
  footer,
];

const REGISTRY = new Map(SECTIONS.map((section) => [section.type, section]));

if (REGISTRY.size !== SECTIONS.length) {
  throw new Error("Two theme sections share a type. Section types must be unique.");
}

export function getSectionDefinition(type: string): AnySectionDefinition | undefined {
  return REGISTRY.get(type);
}

/** What the editor needs to know about a section type: everything but the code. */
export type SectionManifest = Omit<AnySectionDefinition, "Component">;

/** A section type's words in the seller's language: `t.themeSections[type]`. */
export type SectionCopy = {
  name: string;
  description?: string;
  settings?: Record<string, FieldCopy>;
  blocks?: Record<string, { name: string; settings?: Record<string, FieldCopy> }>;
};

/**
 * The registry as plain data, for the editor — a Client Component, which
 * cannot import the section components or their data access.
 *
 * With `copy`, every name, description and setting label is the seller's
 * language's, laid over the schema's English; a type or setting the copy does
 * not mention keeps its English.
 */
export function sectionManifests(
  copy?: Readonly<Record<string, SectionCopy | undefined>>,
): SectionManifest[] {
  return SECTIONS.map(({ Component: _component, ...manifest }) => {
    const words = copy?.[manifest.type];
    if (!words) return manifest;

    return {
      ...manifest,
      name: words.name,
      description: words.description ?? manifest.description,
      settings: localizeFields(manifest.settings, words.settings),
      blocks: Object.fromEntries(
        Object.entries(manifest.blocks).map(([type, block]) => {
          const blockWords = words.blocks?.[type];
          return [
            type,
            blockWords
              ? {
                  ...block,
                  name: blockWords.name,
                  settings: localizeFields(block.settings, blockWords.settings),
                }
              : block,
          ];
        }),
      ),
    };
  });
}
