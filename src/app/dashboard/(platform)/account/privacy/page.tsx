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

export const metadata: Metadata = { title: "Data & privacy" };

export default async function AccountPrivacyPage() {
  const user = await requireUser(accountPath("privacy"));
  const ownedStores = await listOwnedStores(user.id);
  const blockers = accountDeletionBlockers({ ownedStores, platformRole: user.platformRole });

  return (
    <div className="space-y-6">
      <AccountSection
        title="Download your data"
        description="A JSON file with your account details, the stores you're a member of, and the orders you've placed while signed in. Your stores' catalogues and sales stay in each store's admin."
      >
        {/* A plain anchor: the export is a file download, not a page. */}
        <a
          href={accountPath("export")}
          download
          className={buttonClasses("secondary", "sm")}
        >
          Download my data
        </a>
      </AccountSection>

      <AccountSection
        title="Delete account"
        tone="danger"
        description="Deletes your sign-in and profile for good, and signs you out everywhere. Orders you placed stay with the sellers you bought from — they're the stores' records of a sale — but are no longer linked to an account. This can't be undone."
      >
        {blockers.length > 0 ? (
          <div className="space-y-3">
            <FormError>
              <ul className="list-disc space-y-1 ps-4">
                {blockers.map((blocker) => (
                  <li key={blocker.kind}>{describeAccountDeletionBlocker(blocker)}</li>
                ))}
              </ul>
            </FormError>
            {ownedStores.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {ownedStores.map((store) => (
                  <li key={store.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{store.name}</p>
                      <p className="truncate text-sm text-muted">/s/{store.slug}</p>
                    </div>
                    {/* The danger zone is at the foot of Settings → General. */}
                    <a
                      href={storeAdminUrl(store.slug, "settings")}
                      className={buttonClasses("secondary", "sm")}
                    >
                      Delete store
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <DeleteAccountForm action={deleteAccountAction} email={user.email} />
        )}
      </AccountSection>
    </div>
  );
}
