import type { PoolConfig } from "pg";

import { SUPABASE_CA } from "./supabase-ca";

/** Supabase's direct (`db.<ref>.supabase.co`) and pooler (`*.pooler.supabase.com`) hosts. */
function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co");
}

/**
 * The node-postgres pool settings for `DATABASE_URL`.
 *
 * **TLS.** A Supabase URL gets its root CA from `./supabase-ca` instead of the
 * `sslrootcert` file the URL names, which a serverless bundle does not carry.
 * The URL's own `sslmode`/`sslrootcert` are dropped on the way: node-postgres
 * lets SSL settings parsed from the connection string override the `ssl`
 * object, so leaving them in would bring the file read back. With a CA and
 * nothing else, Node verifies both the chain and the hostname — what
 * `sslmode=verify-full` asked for. An explicit `sslmode=disable` (a local
 * `prisma dev` database) and every non-Supabase URL pass through untouched.
 *
 * **Pool size.** Serverless runs many small instances, each with its own pool,
 * all behind one Supabase pooler; the default of ten connections apiece runs
 * the pooler out of clients long before Postgres is busy. Three per instance
 * covers one request's parallel queries, and idle connections are let go
 * quickly so a frozen instance is not holding any.
 */
export function poolConfigFrom(
  connectionString: string,
  { production }: { production: boolean },
): PoolConfig {
  const sizing: PoolConfig = production
    ? { max: 3, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 }
    : { max: 10, connectionTimeoutMillis: 10_000 };

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString, ...sizing };
  }

  const sslmode = url.searchParams.get("sslmode");
  if (!isSupabaseHost(url.hostname) || sslmode === "disable") {
    return { connectionString, ...sizing };
  }

  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");

  return {
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_CA },
    ...sizing,
  };
}
