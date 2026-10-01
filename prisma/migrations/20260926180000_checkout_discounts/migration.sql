-- Discounts in the cart and on orders.
--
-- Additive only: every new column is nullable or has a default, so code that
-- predates this migration keeps working against the migrated schema, and this
-- can be applied ahead of a deploy.

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "discount_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "applied_discounts" JSONB NOT NULL DEFAULT '[]';

-- Codes are stored the way they are compared — upper-case, like
-- `discounts.code` — and a cart holds only a handful. Prisma declares the list
-- column nullable; the IS NOT NULL is the NOT NULL it cannot.
ALTER TABLE "carts"
ADD CONSTRAINT "carts_discount_codes_check" CHECK (
  "discount_codes" IS NOT NULL
  AND cardinality("discount_codes") <= 10
  AND array_to_string("discount_codes", ',') = upper(array_to_string("discount_codes", ','))
),
ADD CONSTRAINT "carts_email_check"
  CHECK ("email" IS NULL OR ("email" <> '' AND "email" = lower(btrim("email"))));

-- A line's discount is never negative and never more than the line cost.
ALTER TABLE "order_lines"
ADD CONSTRAINT "order_lines_discount_cents_check"
  CHECK ("discount_cents" >= 0 AND "discount_cents" <= "unit_price_cents" * "quantity");

ALTER TABLE "orders"
ADD CONSTRAINT "orders_applied_discounts_check"
  CHECK (jsonb_typeof("applied_discounts") = 'array');
