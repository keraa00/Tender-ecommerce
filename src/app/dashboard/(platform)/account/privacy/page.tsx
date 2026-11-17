import type { Metadata } from "next";

import { AccountSection } from "@/components/account/account-section";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { buttonClasses } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { deleteAccountAction } from "@/lib/account/actions";
import {
  accountDeletionBlockers,
  describeAccountDeletionBlocker,
} from "@/lib/account/deletion";
import { listOwnedStores } from "@/lib/account/queries";
import { storeAdminUrl } from "@/lib/admin/links";
import { accountPath } from "@/lib/admin/nav";
import { requireUser } from "@/lib/auth/session";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.account.privacy.title };
}

export default async function AccountPrivacyPage() {
  const user = await requireUser(accountPath("privacy"));
  const [ownedStores, { t: messages }] = await Promise.all([
    listOwnedStores(user.id),
    getAdminI18n(),
  ]);
  const t = messages.account.privacy;
  const blockers = accountDeletionBlockers({ ownedStores, platformRole: user.platformRole });

  return (
    <div className="space-y-6">
      <AccountSection
        title={t.download}
        description={t.downloadHint}
      >
        {/* A plain anchor: the export is a file download, not a page. */}
        <a
          href={accountPath("export")}
          download
          className={buttonClasses("secondary", "sm")}
        >
          {t.downloadButton}
        </a>
      </AccountSection>

      <AccountSection
        title={t.delete}
        tone="danger"
        description={t.deleteHint}
      >
        {blockers.length > 0 ? (
          <div className="space-y-3">
            <FormError>
              <ul className="list-disc space-y-1 ps-4">
                {blockers.map((blocker) => (
                  <li key={blocker.kind}>{describeAccountDeletionBlocker(blocker, t)}</li>
                ))}
              </ul>
            </FormError>
            {ownedStores.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {ownedStores.map((store) => (
                  <li key={store.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{store.name}</p>
                      <p className="truncate text-sm text-muted">
                        <span dir="ltr">/s/{store.slug}</span>
                      </p>
                    </div>
                    {/* The danger zone is at the foot of Settings → General. */}
                    <a
                      href={storeAdminUrl(store.slug, "settings")}
                      className={buttonClasses("secondary", "sm")}
                    >
                      {t.deleteStore}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <DeleteAccountForm
            action={deleteAccountAction}
            email={user.email}
            t={messages.account.forms}
          />
        )}
      </AccountSection>
    </div>
  );
}
