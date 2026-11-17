import "server-only";

import { rootDb } from "@/lib/db/root";

/** How many stores the platform page lists, newest first. */
const STORES_SHOWN = 200;

/**
 * Every store on the platform, for the platform admin's moderation page —
 * cross-store by definition, which is why it reads `rootDb` (see the note at
 * the top of `src/lib/db/root.ts`). The caller has already passed
 * `requirePlatformAdmin()`.
 */
export async function listAllStores() {
  return rootDb.store.findMany({
    orderBy: { createdAt: "desc" },
    take: STORES_SHOWN,
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      accentColor: true,
      status: true,
      featured: true,
      createdAt: true,
      owner: { select: { email: true } },
      _count: { select: { products: true, orders: true } },
    },
  });
}

export type PlatformStore = Awaited<ReturnType<typeof listAllStores>>[number];
