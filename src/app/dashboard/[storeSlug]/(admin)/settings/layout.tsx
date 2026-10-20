import { SettingsNav } from "@/components/admin/settings-nav";

/**
 * Settings is a section of its own pages — General, Payments, Shipping and
 * delivery, Checkout — under one row of tabs. Each page brings its own `AdminPage`
 * heading, so a zone or a rate deep inside Shipping can carry its own title
 * and a way back.
 *
 * Membership was proved by the store layout; nothing here reads the store.
 */
export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[storeSlug]/settings">) {
  const { storeSlug } = await params;

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
        <SettingsNav storeSlug={storeSlug} />
      </div>
      {children}
    </>
  );
}
