import { getAdminI18n } from "@/lib/i18n/server";

/**
 * Shown in place of any store admin page while it renders on the server.
 *
 * Every page here is dynamic, so without this file a click in the drawer does
 * nothing visible until the server answers. Next prefetches this fallback with
 * the shared layout, which makes the switch instant. It mirrors `AdminPage` —
 * same width, heading, stat grid and rows — so the real page lands without the
 * layout jumping.
 */
export default async function StoreAdminLoading() {
  const { t } = await getAdminI18n();

  return (
    <div
      role="status"
      aria-label={t.common.loading}
      className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="h-6 w-40 rounded-md bg-surface-hover" />
      <div className="mt-2.5 h-4 w-72 max-w-full rounded-md bg-surface-hover" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border px-4 py-3">
            <div className="h-3 w-14 rounded bg-surface-hover" />
            <div className="mt-2 h-5 w-10 rounded bg-surface-hover" />
          </div>
        ))}
      </div>

      <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-4 flex-1 rounded bg-surface-hover" />
            <div className="h-4 w-16 rounded bg-surface-hover" />
          </div>
        ))}
      </div>

      <span className="sr-only">{t.common.loadingEllipsis}</span>
    </div>
  );
}
