import "server-only";

import { cache } from "react";

import { rootDb } from "@/lib/db/root";
import { defaultTheme } from "./default-theme";
import type { ThemeDocument } from "./document";
import { resolveTheme } from "./validate";

/**
 * The theme buyers see: the store's published one, or the default when it has
 * never published. Deduplicated per request — the storefront layout and the
 * page both need it.
 */
export const getPublishedTheme = cache(async (storeId: string): Promise<ThemeDocument> => {
  const row = await rootDb.storeTheme.findUnique({
    where: { storeId },
    select: { published: true },
  });

  return row?.published ? resolveTheme(row.published) : defaultTheme();
});
