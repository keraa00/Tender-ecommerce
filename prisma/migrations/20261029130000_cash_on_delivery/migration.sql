-- Cash on delivery: a second way to pay, beside Stripe or instead of it. A
-- store's settings for it, and on each order the method it was placed with
-- and the fee that method added. See `PaymentMethod` in schema.prisma and
-- src/lib/payments/cod.ts.
--
-- Additive: every existing order is a Stripe order with no fee, and every
-- existing store has COD switched off. The tables already have RLS on and
-- their Data API grants revoked (20260827080543_revoke_data_api_access), and
-- new columns inherit both.

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('STRIPE', 'CASH_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "cod_fee_type" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "payment_method" NOT NULL DEFAULT 'STRIPE';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "cod_country_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cod_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cod_fee_type" "cod_fee_type" NOT NULL DEFAULT 'FIXED_AMOUNT',
ADD COLUMN     "cod_fee_value" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cod_instructions" TEXT,
ADD COLUMN     "cod_label" TEXT,
ADD COLUMN     "cod_max_total_cents" INTEGER,
ADD COLUMN     "cod_min_total_cents" INTEGER,
ADD COLUMN     "cod_require_phone" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Shape rules
-- ---------------------------------------------------------------------------

-- The same rules `parseCodSettingsForm()` words for the seller. A CHECK passes
-- when its expression is NULL, so nullable comparisons are wrapped in
-- coalesce(), as in `20261006120000_checkout_shipping`.
ALTER TABLE "stores"
ADD CONSTRAINT "stores_cod_label_check"
  CHECK ("cod_label" IS NULL OR (btrim("cod_label") <> '' AND char_length("cod_label") <= 60)),
ADD CONSTRAINT "stores_cod_instructions_check"
  CHECK ("cod_instructions" IS NULL OR (btrim("cod_instructions") <> '' AND char_length("cod_instructions") <= 500)),
-- Cents up to the same ceiling as a shipping rate; a percentage up to 100%.
ADD CONSTRAINT "stores_cod_fee_check" CHECK (
  CASE "cod_fee_type"
    WHEN 'FIXED_AMOUNT' THEN "cod_fee_value" BETWEEN 0 AND 100000000
    WHEN 'PERCENTAGE' THEN "cod_fee_value" BETWEEN 0 AND 10000
  END
),
ADD CONSTRAINT "stores_cod_limits_check" CHECK (
  coalesce("cod_min_total_cents" BETWEEN 0 AND 100000000000, true)
  AND coalesce("cod_max_total_cents" BETWEEN 0 AND 100000000000, true)
  AND coalesce("cod_min_total_cents" <= "cod_max_total_cents", true)
),
-- Prisma declares the list column nullable; the IS NOT NULL is the NOT NULL it
-- cannot.
ADD CONSTRAINT "stores_cod_country_codes_check" CHECK (
  "cod_country_codes" IS NOT NULL
  AND cardinality("cod_country_codes") <= 300
  AND (cardinality("cod_country_codes") = 0
       OR array_to_string("cod_country_codes", ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$')
);

ALTER TABLE "orders"
ADD CONSTRAINT "orders_payment_fee_check" CHECK (
  "payment_fee_cents" >= 0
  AND ("payment_fee_cents" = 0 OR "payment_method" = 'CASH_ON_DELIVERY')
),
-- Cash goes to a courier, so there is a parcel and an address; and there is
-- no Stripe payment behind it.
ADD CONSTRAINT "orders_cash_on_delivery_check" CHECK (
  "payment_method" <> 'CASH_ON_DELIVERY'
  OR ("shipping_address" IS NOT NULL AND "stripe_payment_intent_id" IS NULL AND "stripe_account_id" IS NULL)
);

-- ---------------------------------------------------------------------------
-- Live "new order" signals
-- ---------------------------------------------------------------------------

-- A cash-on-delivery order is news to the seller when it is placed — that is
-- when there is a parcel to send — and not again when the cash comes in. A
-- Stripe order is still news when it is paid. `paidAtMs` keeps its name and
-- carries when the order arrived, which for COD is `created_at`; the admin
-- compares it with when the member last looked (`orderArrivedAt()` in
-- src/lib/orders/live.ts says the same).
--
-- Only the function changes: the trigger already fires on INSERT and on
-- status updates. Guarded like `20261021120000_live_order_notifications`, so
-- a database without Supabase Realtime still replays this migration.

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL
     OR to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    RAISE NOTICE 'Supabase Realtime is not available; skipping live order broadcasts.';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION private.broadcast_order_paid()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
  DECLARE
    arrived timestamp;
  BEGIN
    IF NEW.payment_method = 'CASH_ON_DELIVERY' THEN
      IF TG_OP <> 'INSERT' THEN
        RETURN NULL;
      END IF;
      arrived := NEW.created_at;
    ELSIF NEW.status = 'PAID' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      arrived := NEW.paid_at;
    ELSE
      RETURN NULL;
    END IF;

    -- In its own exception block: a Realtime hiccup must never roll back the
    -- order or the settlement it rides on. The admin reconciles its count from
    -- the database on every (re)connect.
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'id', NEW.id,
          'orderNumber', NEW.order_number,
          -- Epoch milliseconds: the column has no time zone, and a bare
          -- timestamp string would be read as local time by the browser.
          'paidAtMs', floor(extract(epoch FROM arrived) * 1000)::bigint
        ),
        'order_paid',
        'store:' || NEW.store_id::text || ':orders',
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'broadcast_order_paid: order %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
  END;
  $fn$;

  REVOKE ALL ON FUNCTION private.broadcast_order_paid() FROM PUBLIC;
END
$$;
