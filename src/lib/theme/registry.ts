import type { AnySectionDefinition } from "./define";
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

/**
 * The registry as plain data, for the editor — a Client Component, which
 * cannot import the section components or their data access.
 */
export function sectionManifests(): SectionManifest[] {
  return SECTIONS.map(({ Component: _component, ...manifest }) => manifest);
}
