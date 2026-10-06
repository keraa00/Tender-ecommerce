import type { ReactNode } from "react";

import type { NavItem } from "@/components/storefront/types";
import type { StorefrontCollection } from "@/lib/collections/queries";
import type { Store } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import type { StorefrontProduct } from "@/lib/products/queries";
import type { storefrontPaths } from "@/lib/storefront/links";
import type { ThemeSection } from "./document";
import type { Fields, FieldValues } from "./fields";

/**
 * What a section type is: its settings, the blocks it can hold, and the
 * component that draws it. One `defineSection()` per file under `./sections`,
 * listed once in `./registry`.
 */

/**
 * Everything a section may know about the store it renders for.
 *
 * Sections get data through `data`, never through Prisma: each function is
 * already bound to the store resolved from the URL, so a section has no
 * `storeId` to get wrong and no way to name another store's. It also keeps the
 * section files free of server-only imports, which is what lets the registry's
 * validation run in unit tests.
 */
export type StorefrontContext = {
  store: Pick<Store, "id" | "slug" | "name" | "description" | "logoUrl" | "bannerUrl">;
  locale: Locale;
  t: Messages;
  paths: ReturnType<typeof storefrontPaths>;
  /** The storefront's own pages, as the header and footer list them. */
  nav: NavItem[];
  data: StorefrontData;
};

export type StorefrontData = {
  /** Collections with something on sale in them, A–Z. */
  collections(): Promise<StorefrontCollection[]>;
  /** Published products, newest first. */
  products(options: { limit: number; collectionId?: string }): Promise<StorefrontProduct[]>;
  cartItemCount(): Promise<number>;
};

export type SectionLayout =
  /** Edge to edge, like the hero banner. */
  | "full-bleed"
  /** In the page's content column, spaced evenly from its neighbours. */
  | "contained";

export type BlockDefinition<F extends Fields = Fields> = {
  name: string;
  settings: F;
};

export type BlockDefinitions = Record<string, BlockDefinition>;

/** A block as its section's component receives it: typed by its own fields. */
export type BlockOf<B extends BlockDefinitions> = {
  [K in keyof B & string]: {
    id: string;
    type: K;
    hidden: boolean;
    settings: FieldValues<B[K]["settings"]>;
  };
}[keyof B & string];

export type SectionProps<
  F extends Fields = Fields,
  B extends BlockDefinitions = BlockDefinitions,
> = {
  section: {
    id: string;
    type: string;
    settings: FieldValues<F>;
    /** Visible blocks only, in order. */
    blocks: BlockOf<B>[];
  };
  ctx: StorefrontContext;
};

type SectionComponent<P> = (props: P) => ReactNode | Promise<ReactNode>;

export type SectionDefinition<F extends Fields, B extends BlockDefinitions> = {
  /** Stored in the theme document. Never rename one that has shipped. */
  type: string;
  name: string;
  description?: string;
  layout: SectionLayout;
  /**
   * Header and footer: exactly one each, always present, drawn by the
   * storefront layout rather than placed on a page.
   */
  pinned?: "header" | "footer";
  settings: F;
  blocks?: B;
  maxBlocks?: number;
  /** How many of this section one page may hold. */
  maxPerPage?: number;
  Component: SectionComponent<SectionProps<F, B>>;
};

/**
 * A section definition with its types erased, as the registry holds it. The
 * settings and blocks handed to `Component` have already been resolved
 * against the definition's own fields, which is what the erased signature
 * cannot say.
 */
export type AnySectionDefinition = {
  type: string;
  name: string;
  description?: string;
  layout: SectionLayout;
  pinned?: "header" | "footer";
  settings: Fields;
  blocks: BlockDefinitions;
  maxBlocks: number;
  maxPerPage: number;
  Component: SectionComponent<{ section: ResolvedSection; ctx: StorefrontContext }>;
};

/** A section ready to render: visible blocks only. */
export type ResolvedSection = Omit<ThemeSection, "hidden">;

export function defineSection<
  const F extends Fields,
  const B extends BlockDefinitions = Record<never, BlockDefinition>,
>(definition: SectionDefinition<F, B>): AnySectionDefinition {
  const blocks: BlockDefinitions = definition.blocks ?? {};

  return {
    ...definition,
    blocks,
    maxBlocks:
      Object.keys(blocks).length === 0 ? 0 : (definition.maxBlocks ?? MAX_BLOCKS_DEFAULT),
    maxPerPage: definition.pinned ? 1 : (definition.maxPerPage ?? MAX_PER_PAGE_DEFAULT),
    Component: definition.Component as unknown as AnySectionDefinition["Component"],
  };
}

const MAX_BLOCKS_DEFAULT = 6;
const MAX_PER_PAGE_DEFAULT = 5;
