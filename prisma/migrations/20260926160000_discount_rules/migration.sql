-- Discount rules: several products or collections per discount, buy X get Y,
-- a minimum quantity, customer eligibility, stacking, and a required start.
--
-- Written by hand around the DDL `prisma migrate diff` generates, because two
-- steps need ordering Prisma cannot infer:
--   1. `target_id` is moved into the new link tables before it is dropped, so
--      an existing collection- or product-scoped discount keeps its target.
--   2. `starts_at` is backfilled before it becomes NOT NULL.
--
-- The CHECK constraints at the end are the rules Prisma cannot express. The
-- form parser (src/lib/discounts/form.ts) applies the same rules with readable
-- messages; these are the backstop for every other write path, the seed and
-- the future checkout included. Prisma does not manage CHECK constraints, so
-- they do not show up as drift in `prisma migrate dev`.

-- CreateEnum
CREATE TYPE "discount_target_role" AS ENUM ('DISCOUNTED', 'QUALIFYING');

-- CreateEnum
CREATE TYPE "discount_eligibility" AS ENUM ('ALL', 'SEGMENTS', 'CUSTOMERS');

-- CreateEnum
CREATE TYPE "customer_segment" AS ENUM ('FIRST_TIME', 'RETURNING', 'LOYAL', 'LAPSED', 'ACCOUNT_HOLDERS');

-- AlterTable
ALTER TABLE "discounts"
ADD COLUMN     "buy_quantity" INTEGER,
ADD COLUMN     "buys_from" "discount_applies_to",
ADD COLUMN     "combinable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eligibility" "discount_eligibility" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "get_quantity" INTEGER,
ADD COLUMN     "max_uses_per_order" INTEGER,
ADD COLUMN     "min_quantity" INTEGER,
ADD COLUMN     "segments" "customer_segment"[] DEFAULT ARRAY[]::"customer_segment"[];

-- A discount with no start date was live from the moment it was created.
UPDATE "discounts" SET "starts_at" = "created_at" WHERE "starts_at" IS NULL;

ALTER TABLE "discounts"
ALTER COLUMN "starts_at" SET NOT NULL,
ALTER COLUMN "starts_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "discount_products" (
    "discount_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "role" "discount_target_role" NOT NULL,

    CONSTRAINT "discount_products_pkey" PRIMARY KEY ("discount_id","role","product_id")
);

-- CreateTable
CREATE TABLE "discount_collections" (
    "discount_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "role" "discount_target_role" NOT NULL,

    CONSTRAINT "discount_collections_pkey" PRIMARY KEY ("discount_id","role","collection_id")
);

-- CreateTable
CREATE TABLE "discount_customers" (
    "discount_id" UUID NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "discount_customers_pkey" PRIMARY KEY ("discount_id","email")
);

-- CreateIndex
-- The primary keys lead with discount_id, which covers that side of each
-- foreign key. These cover the other side, so deleting a product or collection
-- cascades through an index rather than a scan.
CREATE INDEX "discount_products_product_id_idx" ON "discount_products"("product_id");

-- CreateIndex
CREATE INDEX "discount_collections_collection_id_idx" ON "discount_collections"("collection_id");

-- AddForeignKey
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_collections" ADD CONSTRAINT "discount_collections_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_collections" ADD CONSTRAINT "discount_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_customers" ADD CONSTRAINT "discount_customers_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move the single `target_id` into the link tables. `target_id` never had a
-- foreign key, so the join doubles as a clean-up: a target that no longer
-- exists, or that belongs to another store, is not carried over.
INSERT INTO "discount_collections" ("discount_id", "collection_id", "role")
SELECT d."id", d."target_id", 'DISCOUNTED'
FROM "discounts" d
JOIN "collections" c ON c."id" = d."target_id" AND c."store_id" = d."store_id"
WHERE d."applies_to" = 'COLLECTION';

INSERT INTO "discount_products" ("discount_id", "product_id", "role")
SELECT d."id", d."target_id", 'DISCOUNTED'
FROM "discounts" d
JOIN "products" p ON p."id" = d."target_id" AND p."store_id" = d."store_id"
WHERE d."applies_to" = 'PRODUCT';

ALTER TABLE "discounts" DROP COLUMN "target_id";

-- Codes are compared upper-case from here on; bring any stragglers into line
-- before the constraint below starts insisting on it.
UPDATE "discounts" SET "code" = NULL WHERE "code" IS NOT NULL AND btrim("code") = '';
UPDATE "discounts" SET "code" = upper(btrim("code"))
WHERE "code" IS NOT NULL AND "code" <> upper(btrim("code"));

-- Shape rules. A CHECK passes when its expression is NULL, so every nullable
-- comparison is wrapped in coalesce() with the answer it should have when the
-- column is empty.
ALTER TABLE "discounts"
ADD CONSTRAINT "discounts_code_check"
  CHECK ("code" IS NULL OR ("code" <> '' AND "code" = upper(btrim("code")))),

-- `value` per type — see the note on the Discount model.
ADD CONSTRAINT "discounts_value_check" CHECK (
  CASE "type"
    WHEN 'PERCENTAGE'    THEN "value" BETWEEN 1 AND 10000
    WHEN 'BUY_X_GET_Y'   THEN "value" BETWEEN 1 AND 10000
    WHEN 'FIXED_AMOUNT'  THEN "value" >= 1
    WHEN 'FREE_SHIPPING' THEN "value" = 0
    ELSE false
  END
),

-- The buy-X-get-Y fields travel together, and only on that type. Its own buy
-- quantity is the requirement, so it takes no separate minimum.
ADD CONSTRAINT "discounts_buy_x_get_y_check" CHECK (
  CASE WHEN "type" = 'BUY_X_GET_Y' THEN
    "buys_from" IS NOT NULL
    AND coalesce("buy_quantity" >= 1, false)
    AND coalesce("get_quantity" >= 1, false)
    AND coalesce("max_uses_per_order" >= 1, true)
    AND "min_subtotal_cents" IS NULL
    AND "min_quantity" IS NULL
  ELSE
    "buys_from" IS NULL
    AND "buy_quantity" IS NULL
    AND "get_quantity" IS NULL
    AND "max_uses_per_order" IS NULL
  END
),

ADD CONSTRAINT "discounts_minimum_check" CHECK (
  ("min_subtotal_cents" IS NULL OR "min_quantity" IS NULL)
  AND coalesce("min_subtotal_cents" >= 1, true)
  AND coalesce("min_quantity" >= 1, true)
),

-- A limit below the current count is allowed: it is how a seller closes a
-- discount early, and it reads as "limit reached".
ADD CONSTRAINT "discounts_limits_check" CHECK (
  "usage_count" >= 0
  AND coalesce("usage_limit" >= 1, true)
  AND coalesce("per_customer_limit" >= 1, true)
),

ADD CONSTRAINT "discounts_window_check"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),

-- Prisma declares list columns nullable; this is the NOT NULL it cannot.
ADD CONSTRAINT "discounts_segments_check" CHECK (
  "segments" IS NOT NULL
  AND ("eligibility" = 'SEGMENTS') = (cardinality("segments") > 0)
);

ALTER TABLE "discount_customers"
ADD CONSTRAINT "discount_customers_email_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")));

-- The per-customer limit counts redemptions by email. Held lower-case, the
-- count is an exact comparison — Prisma's case-insensitive `equals` compiles to
-- ILIKE without escaping, so `a_b@x.com` would otherwise also match `axb@x.com`.
UPDATE "discount_redemptions" SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

ALTER TABLE "discount_redemptions"
ADD CONSTRAINT "discount_redemptions_email_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")));

-- Same posture as `20260827080543_revoke_data_api_access`. The default
-- privileges set there already keep the Data API roles off tables `postgres`
-- creates; revoking by name as well covers a migration run as any other role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    EXECUTE 'REVOKE ALL ON "discount_products", "discount_collections", "discount_customers" FROM anon, authenticated';
  END IF;
END
$$;

-- Deny-all backstop, as on every other table.
ALTER TABLE "discount_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discount_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discount_customers" ENABLE ROW LEVEL SECURITY;
