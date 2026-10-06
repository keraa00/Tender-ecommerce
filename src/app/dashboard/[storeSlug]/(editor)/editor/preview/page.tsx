import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StorefrontFrame } from "@/components/storefront/storefront-frame";
import { PreviewBridge } from "@/components/theme/preview-bridge";
import { canEditTheme } from "@/lib/stores/policy";
import { getStoreContext } from "@/lib/stores/context";
import { getStorefrontContext } from "@/lib/theme/data";
import { getPreviewTheme } from "@/lib/theme/drafts";
import { isPreviewSession } from "@/lib/theme/preview";
import { ThemePage } from "@/lib/theme/render";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

/**
 * The storefront home page drawn from the seller's unsaved edits, for the
 * theme editor's iframe.
 *
 * Inside the admin route tree on purpose: it is served from the admin host,
 * same-origin with the editor, and a draft is visible only to someone
 * `getStoreContext()` has proved is a member of this store. There is no
 * token in the URL to guess or leak — `session` only picks which of the
 * signed-in seller's own staged copies to show.
 */
export default async function ThemePreviewPage(
  props: PageProps<"/dashboard/[storeSlug]/editor/preview">,
) {
  const { storeSlug } = await props.params;
  const { session } = await props.searchParams;
  const { store, user, membership } = await getStoreContext(storeSlug);
  if (!canEditTheme(membership)) notFound();

  const [theme, ctx] = await Promise.all([
    getPreviewTheme(store.id, user.id, isPreviewSession(session) ? session : null),
    getStorefrontContext(store),
  ]);

  return (
    <StorefrontFrame store={store} theme={theme} preview>
      <ThemePage sections={theme.pages.home.sections} ctx={ctx} preview />
      <PreviewBridge />
    </StorefrontFrame>
  );
}
