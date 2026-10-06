import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ThemeEditor } from "@/components/theme/editor/theme-editor";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { listCollectionOptions } from "@/lib/collections/queries";
import { canEditTheme, canPublishTheme } from "@/lib/stores/policy";
import { getStoreContext } from "@/lib/stores/context";
import {
  publishThemeAction,
  saveThemeDraftAction,
  stagePreviewAction,
  uploadThemeImageAction,
} from "@/lib/theme/actions";
import { getThemeDraft } from "@/lib/theme/drafts";
import { newPreviewSession } from "@/lib/theme/preview";
import { sectionManifests } from "@/lib/theme/registry";
import { hasUnpublishedChanges } from "@/lib/theme/status";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/editor">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Edit theme · ${store.name}` };
}

/**
 * The full-screen theme editor. Outside the `(admin)` group, so it has the
 * whole window rather than the space beside the drawer; membership is still
 * proved by the store layout above, and again here.
 */
export default async function ThemeEditorPage(
  props: PageProps<"/dashboard/[storeSlug]/editor">,
) {
  const { storeSlug } = await props.params;
  const { store, membership } = await getStoreContext(storeSlug);
  if (!canEditTheme(membership)) notFound();

  const [draft, collections] = await Promise.all([
    getThemeDraft(store.id),
    listCollectionOptions(store.id),
  ]);

  // Made here rather than in the browser, so the iframe's URL is the same in
  // the server render and after hydration.
  const session = newPreviewSession();

  return (
    <ThemeEditor
      store={{ name: store.name, accentColor: store.accentColor }}
      initialDocument={draft.document}
      initialVersion={draft.version}
      initialUnpublished={hasUnpublishedChanges(draft.status)}
      manifests={sectionManifests()}
      collections={collections}
      session={session}
      urls={{
        exit: storeAdminPath(store.slug, "online-store"),
        preview: `${storeAdminPath(store.slug, "editor/preview")}?session=${session}`,
        storefront: storefrontUrl(store.slug),
      }}
      canPublish={canPublishTheme(membership)}
      actions={{
        save: saveThemeDraftAction.bind(null, storeSlug),
        stage: stagePreviewAction.bind(null, storeSlug),
        upload: uploadThemeImageAction.bind(null, storeSlug),
        publish: publishThemeAction.bind(null, storeSlug),
      }}
    />
  );
}
