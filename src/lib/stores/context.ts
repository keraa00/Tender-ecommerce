import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { rootDb } from "@/lib/db/root";
import type { Store, StoreMember, User } from "@/lib/db/types";

/**
 * Resolves the tenant for a seller-admin request.
 *
 * This is the single place where "which store is this request about?" is
 * answered, and it answers it from the URL slug plus the authenticated session
 * — never from a request body. Everything downstream receives an already
 * verified `store.id` to scope by.
 *
 * The return value is intended to grow a Prisma client extension that injects
 * `storeId` into every query automatically; call sites written against this
 * shape will not need to change when it does.
 */
export type StoreContext = {
  user: User;
  store: Store;
  membership: StoreMember;
};

export const getStoreContext = cache(
  async (slug: string): Promise<StoreContext> => {
    const user = await requireUser(`/dashboard/${slug}`);

    const store = await rootDb.store.findUnique({
      where: { slug },
      include: {
        // Scoped to this user, so a hit proves membership in the same round
        // trip that resolves the store.
        members: { where: { userId: user.id }, take: 1 },
      },
    });

    const membership = store?.members[0];

    // Non-members get 404, not 403. A seller poking at /dashboard/<rival-slug>
    // should learn nothing at all — including whether their guess was right.
    if (!store || !membership) notFound();

    const { members: _members, ...storeFields } = store;

    return { user, store: storeFields, membership };
  },
);
