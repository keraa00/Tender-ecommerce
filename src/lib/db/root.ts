import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The unscoped Prisma client.
 *
 * ⚠️ Do not import this from route handlers, server actions, or page components
 * for anything store-scoped. It has no tenant filter and will happily read
 * another seller's data.
 *
 * Legitimate callers are exactly three:
 *   1. `getStoreContext()` — the scoped-client factory (see
 *      `src/lib/stores/context.ts`)
 *   2. Auth / user-identity lookups, which are not store-scoped
 *   3. Platform-admin queries, which are cross-store by definition
 *
 * Everything else goes through the scoped client. Isolation enforced in one
 * place beats isolation remembered in ninety.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

// Next.js dev-server hot reload re-evaluates modules; without this the process
// accumulates connection pools until Postgres refuses new connections.
//
// The cached client is only reused while it came from the current generated
// `PrismaClient` class. `prisma generate` after a schema change hot-reloads a
// new class, and an instance of the old one still carries the old schema — so
// every query touching a new field fails with "Unknown field … for include
// statement" until the dev server is restarted. A new class gets a new client,
// and the stale one's pool is released.
const globalForPrisma = globalThis as unknown as {
  rootDb?: ReturnType<typeof createPrismaClient>;
  rootDbClass?: typeof PrismaClient;
};

function devCachedClient() {
  const cached = globalForPrisma.rootDb;
  if (cached && globalForPrisma.rootDbClass === PrismaClient) return cached;
  if (cached) void cached.$disconnect();
  return createPrismaClient();
}

export const rootDb = devCachedClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.rootDb = rootDb;
  globalForPrisma.rootDbClass = PrismaClient;
}
