import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { poolConfigFrom } from "@/lib/db/pool-config";
import { SUPABASE_CA } from "@/lib/db/supabase-ca";

const POOLER =
  "postgresql://postgres.ref:secret@aws-1-eu-west-3.pooler.supabase.com:5432/postgres";

describe("poolConfigFrom", () => {
  it("swaps a Supabase URL's sslrootcert file for the bundled CA", () => {
    const config = poolConfigFrom(
      `${POOLER}?sslmode=verify-full&sslrootcert=./certs/supabase-ca.crt`,
      { production: true },
    );

    expect(config.ssl).toEqual({ ca: SUPABASE_CA });
    const url = new URL(config.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.hostname).toBe("aws-1-eu-west-3.pooler.supabase.com");
    expect(url.password).toBe("secret");
  });

  it("verifies a Supabase URL even when it names no sslmode", () => {
    const config = poolConfigFrom(POOLER.replace(":5432", ":6543"), { production: true });
    expect(config.ssl).toEqual({ ca: SUPABASE_CA });
  });

  it("keeps other query parameters", () => {
    const config = poolConfigFrom(`${POOLER}?sslmode=require&application_name=tender`, {
      production: true,
    });
    expect(new URL(config.connectionString!).searchParams.get("application_name")).toBe("tender");
  });

  it("leaves local and explicitly plain-text URLs alone", () => {
    const local = "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";
    expect(poolConfigFrom(local, { production: false })).toMatchObject({
      connectionString: local,
    });
    expect(poolConfigFrom(local, { production: false }).ssl).toBeUndefined();

    const plain = `${POOLER}?sslmode=disable`;
    expect(poolConfigFrom(plain, { production: true }).ssl).toBeUndefined();
  });

  it("sizes the pool for serverless in production only", () => {
    expect(poolConfigFrom(POOLER, { production: true })).toMatchObject({
      max: 3,
      idleTimeoutMillis: 5_000,
    });
    expect(poolConfigFrom(POOLER, { production: false }).max).toBe(10);
  });
});

describe("SUPABASE_CA", () => {
  it("is the certificate committed at certs/supabase-ca.crt", () => {
    expect(SUPABASE_CA).toBe(readFileSync("certs/supabase-ca.crt", "utf8"));
  });
});
