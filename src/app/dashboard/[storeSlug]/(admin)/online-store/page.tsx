import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { TenderMark } from "@/components/tender-mark";
import { PublishThemeButton } from "@/components/theme/publish-theme-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { canPublishTheme } from "@/lib/stores/policy";
import { getStoreContext } from "@/lib/stores/context";
import { publishThemeAction } from "@/lib/theme/actions";
import { THEME_SETTINGS } from "@/lib/theme/document";
import { getThemeDraft } from "@/lib/theme/drafts";
import {
  hasUnpublishedChanges,
  themeStatusBadge,
  themeStatusSummary,
} from "@/lib/theme/status";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/online-store">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Online store · ${store.name}` };
}

/**
 * The online store's design: which theme is live, whether a saved draft is
 * waiting, and the way into changing it.
 */
export default async function OnlineStorePage(
  props: PageProps<"/dashboard/[storeSlug]/online-store">,
) {
  const { storeSlug } = await props.params;
  const { store, membership } = await getStoreContext(storeSlug);
  const draft = await getThemeDraft(store.id);

  const badge = themeStatusBadge(draft.status);
  const { settings } = draft.document;
  const accent = settings.accent ?? store.accentColor;
  const option = (key: "headingFont" | "bodyFont") =>
    THEME_SETTINGS[key].options.find((entry) => entry.value === settings[key])?.label;

  return (
    <AdminPage
      title="Online store"
      description="How your storefront looks to buyers. Changes are saved as a draft and go live when you publish."
      action={
        <ButtonLink href={storefrontUrl(store.slug)} target="_blank" rel="noreferrer" variant="secondary">
          View store
        </ButtonLink>
      }
    >
      <section
        aria-labelledby="current-theme"
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <div className="flex flex-wrap items-start gap-4 p-5">
          <TenderMark size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Current theme</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 id="current-theme" className="font-semibold tracking-tight">
                {draft.name}
              </h2>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted text-pretty">
              {themeStatusSummary(draft.status)}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <div className="flex gap-1">
                <dt>Accent</dt>
                <dd className="font-medium text-foreground tabular">
                  {accent ?? "Default"}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>Fonts</dt>
                <dd className="font-medium text-foreground">
                  {option("headingFont")} / {option("bodyFont")}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3">
          <ButtonLink
            href={storeAdminPath(store.slug, "editor")}
            variant="secondary"
          >
            Customize
          </ButtonLink>
          {hasUnpublishedChanges(draft.status) && canPublishTheme(membership) ? (
            <PublishThemeButton
              action={publishThemeAction.bind(null, storeSlug)}
              version={draft.version}
            />
          ) : null}
        </div>
      </section>
    </AdminPage>
  );
}
