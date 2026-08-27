-- Close the Supabase Data API over the `public` schema.
--
-- Supabase publishes every table in `public` through PostgREST, and its stock
-- grants give `anon` and `authenticated` full DML on each one. `anon` is the
-- role behind NEXT_PUBLIC_SUPABASE_ANON_KEY, which ships to every browser that
-- loads the app, so the default posture leaves the whole catalogue — orders,
-- carts, users — readable and writable by anyone who reads the page source.
--
-- That route also bypasses the tenancy invariant in schema.prisma: `storeId`
-- scoping is enforced in application code (src/lib/stores/context.ts), and
-- PostgREST does not run application code.
--
-- Nothing here needs the Data API. `supabase-js` is called only for `auth.*`
-- (src/lib/supabase/), and every read and write goes through Prisma on the
-- direct Postgres connection as the table owner. So the surface is closed
-- outright rather than modelled with policies.
--
-- Two layers:
--   1. The table grants, plus the default privileges that would otherwise
--      re-grant them on the next CREATE TABLE.
--   2. RLS with no policies, as a deny-all backstop should a grant ever return.
--
-- A third layer — REVOKE USAGE ON SCHEMA public — is deliberately absent. That
-- privilege is not held by `anon` directly; it comes from the grant to PUBLIC
-- (`=U/pg_database_owner` in pg_namespace.nspacl), so revoking it by role name
-- is a silent no-op. Revoking it from PUBLIC would work, but takes it from
-- every other role at the same time, `authenticator` and the extensions
-- included. The two layers below are sufficient without that risk.
--
-- `service_role` is deliberately left intact: it is server-only, already
-- bypasses RLS, and the seed script depends on it.
--
-- The role-dependent half is guarded on pg_roles, because `anon` and
-- `authenticated` are Supabase constructs that do not exist on a local
-- `prisma dev` database, where this migration still has to replay cleanly.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    -- Stop future tables inheriting the stock grants. Prisma creates tables as
    -- `postgres`, so that is the role whose defaults matter.
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';

    -- Take back what the existing objects already granted.
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
  END IF;
END
$$;

-- Deny-all backstop. The `postgres` owner bypasses RLS (nothing here uses FORCE
-- ROW LEVEL SECURITY), and Prisma connects as `postgres`, so the application is
-- unaffected. `_prisma_migrations` is intentionally omitted: the revocations
-- above already cover it, and leaving it untouched keeps the migration engine
-- working even if it is ever pointed at a non-owner role.
ALTER TABLE "cart_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discount_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
