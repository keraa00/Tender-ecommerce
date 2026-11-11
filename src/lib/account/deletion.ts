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

export function describeAccountDeletionBlocker(blocker: AccountDeletionBlocker): string {
  switch (blocker.kind) {
    case "owns-stores":
      return blocker.stores.length === 1
        ? `You still own ${blocker.stores[0].name}. Delete it from its Settings first.`
        : `You still own ${blocker.stores.length} stores. Delete each one from its Settings first.`;
    case "platform-admin":
      return "Platform admin accounts can't be deleted here. Have your platform role removed first.";
  }
}
