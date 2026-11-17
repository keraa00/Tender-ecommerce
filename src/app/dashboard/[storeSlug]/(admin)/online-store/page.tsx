import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/page-shell";
import { TenderMark } from "@/components/tender-mark";
import { PublishThemeButton } from "@/components/theme/publish-theme-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.onlineStore.title} · ${store.name}` };
}

/**
 * The online store's design: which theme is live, whether a saved draft is
 * waiting, and the way into changing it.
 */
export default async function OnlineStorePage(
  props: PageProps<"/dashboard/[storeSlug]/online-store">,
) {
  const { storeSlug } = await props.params;
  const [{ store, membership }, { t: messages, locale }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.onlineStore;
  const draft = await getThemeDraft(store.id);

  const badge = themeStatusBadge(draft.status, { locale, t });
  const { settings } = draft.document;
  const accent = settings.accent ?? store.accentColor;
  const option = (key: "headingFont" | "bodyFont") =>
    THEME_SETTINGS[key].options.find((entry) => entry.value === settings[key])?.label;

  return (
    <AdminPage
      title={t.title}
      description={t.description}
      action={
        <ButtonLink href={storefrontUrl(store.slug)} target="_blank" rel="noreferrer" variant="secondary">
          {t.viewStore}
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
            <p className="text-xs text-muted">{t.currentTheme}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 id="current-theme" className="font-semibold tracking-tight">
                {draft.name}
              </h2>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted text-pretty">
              {themeStatusSummary(draft.status, { locale, t })}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <div className="flex gap-1">
                <dt>{t.accent}</dt>
                <dd className="font-medium text-foreground tabular" dir="ltr">
                  {accent ?? t.defaultAccent}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>{t.fonts}</dt>
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
            {t.customize}
          </ButtonLink>
          {hasUnpublishedChanges(draft.status) && canPublishTheme(membership) ? (
            <PublishThemeButton
              action={publishThemeAction.bind(null, storeSlug)}
              version={draft.version}
              t={{ publish: t.publish, publishing: t.publishing }}
            />
          ) : null}
        </div>
      </section>
    </AdminPage>
  );
}
