-- Checkout and shipping: shipping zones and rates, the store's currency and
-- contact email, checkout field options, shipping weight on variants,
-- "requires shipping" on products, the in-progress checkout and a second
-- ("Buy it now") cart per session, and the delivery snapshot on orders.
--
-- Written by hand around the DDL `prisma migrate diff` generates. Additive:
-- every new column is nullable or has a default, and the one loosened column
-- (`orders.shipping_address`, now nullable for digital orders) only accepts
-- more than before — so code that predates this keeps working against it.
--
-- The CHECK constraints at the end are the rules Prisma cannot express. The
-- form parsers in `src/lib/shipping/form.ts` and `src/lib/stores/settings-form.ts`
-- apply the same rules with readable messages; these are the backstop for
-- every other write path, the seed included.

-- CreateEnum
CREATE TYPE "checkout_field_mode" AS ENUM ('HIDDEN', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "cart_kind" AS ENUM ('STANDARD', 'BUY_NOW');

-- DropIndex
DROP INDEX "carts_store_id_session_id_key";

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "checkout_draft" JSONB,
ADD COLUMN     "kind" "cart_kind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "shipping_rate_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billing_address" JSONB,
ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN     "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "shipping_max_days" INTEGER,
ADD COLUMN     "shipping_min_days" INTEGER,
ADD COLUMN     "shipping_rate_id" UUID,
ADD COLUMN     "shipping_rate_name" TEXT,
ADD COLUMN     "shipping_zone_name" TEXT,
ALTER COLUMN "shipping_address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "requires_shipping" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "checkout_address2" "checkout_field_mode" NOT NULL DEFAULT 'OPTIONAL',
ADD COLUMN     "checkout_company" "checkout_field_mode" NOT NULL DEFAULT 'HIDDEN',
ADD COLUMN     "checkout_first_name" "checkout_field_mode" NOT NULL DEFAULT 'OPTIONAL',
ADD COLUMN     "checkout_marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkout_order_note" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkout_phone" "checkout_field_mode" NOT NULL DEFAULT 'HIDDEN',
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "variants" ADD COLUMN     "weight_grams" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rest_of_world" BOOLEAN,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone_countries" (
    "store_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "region_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "shipping_zone_countries_pkey" PRIMARY KEY ("store_id","country_code")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "min_delivery_days" INTEGER,
    "max_delivery_days" INTEGER,
    "min_subtotal_cents" INTEGER,
    "max_subtotal_cents" INTEGER,
    "min_weight_grams" INTEGER,
    "max_weight_grams" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zones_id_store_id_key" ON "shipping_zones"("id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zones_store_id_rest_of_world_key" ON "shipping_zones"("store_id", "rest_of_world");

-- CreateIndex
CREATE INDEX "shipping_zone_countries_zone_id_store_id_idx" ON "shipping_zone_countries"("zone_id", "store_id");

-- CreateIndex
CREATE INDEX "shipping_rates_zone_id_store_id_idx" ON "shipping_rates"("zone_id", "store_id");

-- CreateIndex
CREATE INDEX "shipping_rates_store_id_idx" ON "shipping_rates"("store_id");

-- CreateIndex
CREATE INDEX "carts_shipping_rate_id_idx" ON "carts"("shipping_rate_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_store_id_session_id_kind_key" ON "carts"("store_id", "session_id", "kind");

-- CreateIndex
CREATE INDEX "orders_shipping_rate_id_idx" ON "orders"("shipping_rate_id");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_shipping_rate_id_fkey" FOREIGN KEY ("shipping_rate_id") REFERENCES "shipping_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_countries" ADD CONSTRAINT "shipping_zone_countries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_countries" ADD CONSTRAINT "shipping_zone_countries_zone_id_store_id_fkey" FOREIGN KEY ("zone_id", "store_id") REFERENCES "shipping_zones"("id", "store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_store_id_fkey" FOREIGN KEY ("zone_id", "store_id") REFERENCES "shipping_zones"("id", "store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_rate_id_fkey" FOREIGN KEY ("shipping_rate_id") REFERENCES "shipping_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Shape rules
-- ---------------------------------------------------------------------------

-- A CHECK passes when its expression is NULL, so every nullable comparison is
-- wrapped in coalesce() with the answer it should have when the column is
-- empty — as in `20260926160000_discount_rules`.

ALTER TABLE "stores"
ADD CONSTRAINT "stores_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "stores_contact_email_check"
  CHECK ("contact_email" IS NULL OR ("contact_email" <> '' AND "contact_email" = lower(btrim("contact_email")))),
-- The last name is always asked for, so the first name may be optional but
-- never hidden; line 2 ("Apartment, suite") is never something to insist on.
ADD CONSTRAINT "stores_checkout_first_name_check" CHECK ("checkout_first_name" <> 'HIDDEN'),
ADD CONSTRAINT "stores_checkout_address2_check" CHECK ("checkout_address2" <> 'REQUIRED');

ALTER TABLE "variants"
ADD CONSTRAINT "variants_weight_grams_check" CHECK ("weight_grams" BETWEEN 0 AND 1000000);

-- True or null, never false: that is what lets the composite unique on
-- (store_id, rest_of_world) mean "at most one rest-of-world zone per store".
ALTER TABLE "shipping_zones"
ADD CONSTRAINT "shipping_zones_rest_of_world_check" CHECK ("rest_of_world" IS NULL OR "rest_of_world"),
ADD CONSTRAINT "shipping_zones_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 80);

-- Region codes are ISO 3166-2 subdivision codes without the country prefix:
-- one to three upper-case letters or digits ("CA", "13", "CMX").
ALTER TABLE "shipping_zone_countries"
ADD CONSTRAINT "shipping_zone_countries_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
ADD CONSTRAINT "shipping_zone_countries_region_codes_check" CHECK (
  "region_codes" IS NOT NULL
  AND cardinality("region_codes") <= 200
  AND (cardinality("region_codes") = 0
       OR array_to_string("region_codes", ',') ~ '^[A-Z0-9]{1,3}(,[A-Z0-9]{1,3})*$')
);

ALTER TABLE "shipping_rates"
ADD CONSTRAINT "shipping_rates_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 80),
ADD CONSTRAINT "shipping_rates_price_check" CHECK ("price_cents" BETWEEN 0 AND 100000000),
-- An estimate is a range, given whole or not at all.
ADD CONSTRAINT "shipping_rates_delivery_check" CHECK (
  ("min_delivery_days" IS NULL) = ("max_delivery_days" IS NULL)
  AND coalesce("min_delivery_days" >= 0, true)
  AND coalesce("max_delivery_days" <= 90, true)
  AND coalesce("min_delivery_days" <= "max_delivery_days", true)
),
-- One kind of condition at most: subtotal or weight.
ADD CONSTRAINT "shipping_rates_condition_check" CHECK (
  NOT (
    ("min_subtotal_cents" IS NOT NULL OR "max_subtotal_cents" IS NOT NULL)
    AND ("min_weight_grams" IS NOT NULL OR "max_weight_grams" IS NOT NULL)
  )
  AND coalesce("min_subtotal_cents" >= 0, true)
  AND coalesce("max_subtotal_cents" >= 0, true)
  AND coalesce("min_subtotal_cents" <= "max_subtotal_cents", true)
  AND coalesce("min_weight_grams" >= 0, true)
  AND coalesce("max_weight_grams" >= 0, true)
  AND coalesce("min_weight_grams" <= "max_weight_grams", true)
);

-- The draft is the buyer's unvalidated typing: an object, and small.
ALTER TABLE "carts"
ADD CONSTRAINT "carts_checkout_draft_check"
  CHECK ("checkout_draft" IS NULL OR (jsonb_typeof("checkout_draft") = 'object' AND octet_length("checkout_draft"::text) <= 16384));

ALTER TABLE "orders"
ADD CONSTRAINT "orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "orders_shipping_address_check"
  CHECK ("shipping_address" IS NULL OR jsonb_typeof("shipping_address") = 'object'),
ADD CONSTRAINT "orders_billing_address_check"
  CHECK ("billing_address" IS NULL OR jsonb_typeof("billing_address") = 'object'),
ADD CONSTRAINT "orders_note_check" CHECK ("note" IS NULL OR char_length("note") <= 1000),
ADD CONSTRAINT "orders_shipping_days_check" CHECK (
  ("shipping_min_days" IS NULL) = ("shipping_max_days" IS NULL)
  AND coalesce("shipping_min_days" <= "shipping_max_days", true)
),
-- A rate snapshot needs an address to have been shipped to.
ADD CONSTRAINT "orders_shipping_rate_check"
  CHECK ("shipping_rate_name" IS NULL OR "shipping_address" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Data API
-- ---------------------------------------------------------------------------

-- Same posture as `20260827080543_revoke_data_api_access`: closed to the
-- Supabase Data API, with RLS and no policies as the deny-all backstop.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    EXECUTE 'REVOKE ALL ON "shipping_zones", "shipping_zone_countries", "shipping_rates" FROM anon, authenticated';
  END IF;
END
$$;

ALTER TABLE "shipping_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipping_zone_countries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipping_rates" ENABLE ROW LEVEL SECURITY;
