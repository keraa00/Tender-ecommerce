import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { PlatformRole } from "@/lib/db/types";

/**
 * What stands between an account and deleting it. Pure, so the privacy page
 * can show the list and the Server Action can re-check it with the same rules.
 */

export type OwnedStoreSummary = { name: string; slug: string };

export type AccountDeletionBlocker =
  /**
   * `stores.owner_id` is `ON DELETE RESTRICT`: a store outliving its owner
   * would be a business nobody can sign in to run, still taking orders. Each
   * store is deleted from its own Settings first, which settles its orders.
   */
  | { kind: "owns-stores"; stores: OwnedStoreSummary[] }
  /** The platform must not lose its last operator to a stray click. */
  | { kind: "platform-admin" };

export function accountDeletionBlockers({
  ownedStores,
  platformRole,
}: {
  ownedStores: readonly OwnedStoreSummary[];
  platformRole: PlatformRole;
}): AccountDeletionBlocker[] {
  const blockers: AccountDeletionBlocker[] = [];

  if (ownedStores.length > 0) {
    blockers.push({ kind: "owns-stores", stores: [...ownedStores] });
  }
  if (platformRole === PlatformRole.PLATFORM_ADMIN) {
    blockers.push({ kind: "platform-admin" });
  }

  return blockers;
}

/** The refusal's wording, in the seller's language: `t.account.privacy`. */
export type AccountDeletionCopy = Pick<
  AdminMessages["account"]["privacy"],
  "ownsStore" | "ownsStores" | "platformAdmin"
>;

const ENGLISH: AccountDeletionCopy = {
  ownsStore: "You still own {store}. Delete it from its Settings first.",
  ownsStores: "You still own {count} stores. Delete each one from its Settings first.",
  platformAdmin:
    "Platform admin accounts can't be deleted here. Have your platform role removed first.",
};

export function describeAccountDeletionBlocker(
  blocker: AccountDeletionBlocker,
  t: AccountDeletionCopy = ENGLISH,
): string {
  switch (blocker.kind) {
    case "owns-stores":
      // One or several — there is no plural form to pick between, since the
      // one-store sentence names the store rather than counting it.
      return blocker.stores.length === 1
        ? format(t.ownsStore, { store: blocker.stores[0].name })
        : format(t.ownsStores, { count: blocker.stores.length });
    case "platform-admin":
      return t.platformAdmin;
  }
}
