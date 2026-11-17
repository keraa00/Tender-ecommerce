-- Store moderation and refund/dispute sync.
--
-- - `stores.featured`: what the platform's landing page and /stores list.
--   Off by default, so a stranger's new store is not on the front page until a
--   platform admin features it (`src/lib/platform/actions.ts`).
-- - `orders.refunded_cents` / `refunded_at`: refunds made in the seller's
--   Stripe Dashboard, brought back by the `charge.refunded` webhook.
-- - `order_issue` 'DISPUTED': a charge the buyer disputed with their bank.
--
-- Additive only. Both tables already have RLS on and their Data API grants
-- revoked (20260827080543_revoke_data_api_access); new columns inherit both.

-- AlterEnum
-- Not used in this migration, so it can be added inside its transaction.
ALTER TYPE "order_issue" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_cents" INTEGER NOT NULL DEFAULT 0;

-- A refund is part of what was charged: never negative, never more than it.
ALTER TABLE "orders"
ADD CONSTRAINT "orders_refunded_cents_check" CHECK ("refunded_cents" BETWEEN 0 AND "total_cents");

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

-- The demo stores the seed creates keep their place on the landing page. Their
-- owners are the seed's `@example.com` accounts; on a database without them
-- this changes nothing.
UPDATE "stores"
SET "featured" = true
WHERE "owner_id" IN (SELECT "id" FROM "users" WHERE "email" LIKE '%@example.com');
