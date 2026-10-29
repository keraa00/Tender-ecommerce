-- AlterTable
ALTER TABLE "store_members" ADD COLUMN     "orders_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "orders_store_id_paid_at_idx" ON "orders"("store_id", "paid_at");

-- Live "new order" signals for the seller admin, over Supabase Realtime
-- Broadcast.
--
-- An order becomes news to the seller when it is paid, not when checkout is
-- submitted: PENDING rows are often abandoned. Several paths flip an order to
-- PAID (the Stripe webhook, the buyer's confirmation page, zero-total orders),
-- all through `settleOrder()` in src/lib/payments/settle.ts. A trigger on the
-- status column catches every one of them without each having to remember to
-- announce it, and because `realtime.send` writes a row that Realtime reads
-- from the WAL, a settlement that rolls back announces nothing.
--
-- The payload is the bare minimum the admin needs to count and deduplicate —
-- no email, no address. It goes to a private topic per store,
-- `store:<store_id>:orders`, and the policy at the end lets a signed-in user
-- join it only if they are a member of that store.
--
-- Helpers live in a `private` schema, which the Data API does not expose:
-- functions are executable by PUBLIC on creation, and the store membership
-- check has to be SECURITY DEFINER because `store_members` is closed to
-- `authenticated` (see 20260827080543_revoke_data_api_access).
--
-- Everything below needs Supabase's `realtime` schema and roles, which a local
-- `prisma dev` database does not have, so it is skipped there and the
-- migration still replays cleanly.

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL
     OR to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    RAISE NOTICE 'Supabase Realtime is not available; skipping live order broadcasts.';
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS private;

  -- Announces PENDING → PAID. The send sits in its own exception block: a
  -- Realtime hiccup (for instance today's message partition not existing yet)
  -- must never roll back the payment settlement it rides on. The admin
  -- reconciles its count from the database on every (re)connect, so a lost
  -- announcement only delays the badge.
  CREATE OR REPLACE FUNCTION private.broadcast_order_paid()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
  BEGIN
    IF NEW.status = 'PAID' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      BEGIN
        PERFORM realtime.send(
          jsonb_build_object(
            'id', NEW.id,
            'orderNumber', NEW.order_number,
            -- Epoch milliseconds: `paid_at` has no time zone, and a bare
            -- timestamp string would be read as local time by the browser.
            'paidAtMs', floor(extract(epoch FROM NEW.paid_at) * 1000)::bigint
          ),
          'order_paid',
          'store:' || NEW.store_id::text || ':orders',
          true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'broadcast_order_paid: order %: %', NEW.id, SQLERRM;
      END;
    END IF;
    RETURN NULL;
  END;
  $fn$;

  REVOKE ALL ON FUNCTION private.broadcast_order_paid() FROM PUBLIC;

  DROP TRIGGER IF EXISTS orders_broadcast_paid ON public.orders;
  CREATE TRIGGER orders_broadcast_paid
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_order_paid();

  -- Whether the signed-in user may join a store's order topic. The topic is
  -- checked for shape before the cast, so a malformed join is a plain "no"
  -- rather than an error.
  CREATE OR REPLACE FUNCTION private.can_receive_store_orders(topic text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT CASE
      WHEN topic ~ '^store:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:orders$' THEN
        EXISTS (
          SELECT 1
          FROM public.store_members m
          WHERE m.store_id = split_part(topic, ':', 2)::uuid
            AND m.user_id = (SELECT auth.uid())
        )
      ELSE false
    END;
  $fn$;

  REVOKE ALL ON FUNCTION private.can_receive_store_orders(text) FROM PUBLIC;
  GRANT USAGE ON SCHEMA private TO authenticated;
  GRANT EXECUTE ON FUNCTION private.can_receive_store_orders(text) TO authenticated;

  -- Realtime evaluates this when a client joins a private channel and caches
  -- the answer for the connection, so it costs one lookup per join, not one
  -- per message.
  DROP POLICY IF EXISTS "store members receive order broadcasts" ON realtime.messages;
  CREATE POLICY "store members receive order broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT private.can_receive_store_orders((SELECT realtime.topic())))
  );
END
$$;
