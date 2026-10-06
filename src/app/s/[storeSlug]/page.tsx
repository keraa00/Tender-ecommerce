import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStoreBySlug } from "@/lib/stores/queries";
import { getStorefrontContext } from "@/lib/theme/data";
import { getPublishedTheme } from "@/lib/theme/queries";
import { ThemePage } from "@/lib/theme/render";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) return { title: "Store not found" };

  return {
    title: store.name,
    description: store.description ?? undefined,
  };
}

/**
 * The store's home page, drawn from its published theme — or from the default
 * theme, which is this page as it was before themes existed.
 */
export default async function StorefrontPage(
  props: PageProps<"/s/[storeSlug]">,
) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  // The tenant key comes from the resolved slug, not from anything the client
  // could set; the sections only ever see data bound to it.
  const [theme, ctx] = await Promise.all([
    getPublishedTheme(store.id),
    getStorefrontContext(store),
  ]);

  return <ThemePage sections={theme.pages.home.sections} ctx={ctx} />;
}
